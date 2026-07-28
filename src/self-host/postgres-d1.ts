import type { Pool, PoolClient, QueryResultRow } from "pg";

type BoundValue = null | string | number | boolean | ArrayBuffer | ArrayBufferView;

class PostgresPreparedStatement {
  private values: BoundValue[] = [];

  constructor(
    private readonly pool: Pool | PoolClient,
    private readonly sql: string,
  ) {}

  bind(...values: BoundValue[]) {
    const statement = new PostgresPreparedStatement(this.pool, this.sql);
    statement.values = values;
    return statement;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.pool.query<T & QueryResultRow>(
      toPostgresParameters(this.sql),
      this.values.map(toPostgresValue),
    );
    return result.rows[0] ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.pool.query<T & QueryResultRow>(
      toPostgresParameters(this.sql),
      this.values.map(toPostgresValue),
    );
    return {
      results: result.rows,
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
      },
    };
  }

  async run() {
    const result = await this.pool.query(
      toPostgresParameters(this.sql),
      this.values.map(toPostgresValue),
    );
    return {
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
      },
    };
  }

  withClient(client: PoolClient) {
    const statement = new PostgresPreparedStatement(client, this.sql);
    statement.values = this.values;
    return statement;
  }
}

export class PostgresD1CompatibilityDatabase {
  constructor(private readonly pool: Pool) {}

  prepare(sql: string) {
    return new PostgresPreparedStatement(this.pool, sql);
  }

  async batch(statements: PostgresPreparedStatement[]) {
    return this.batchWithPostcondition(statements, () => undefined);
  }

  async batchWithPostcondition(
    statements: PostgresPreparedStatement[],
    postcondition: (
      results: Array<{
        success: boolean;
        meta: { changes: number };
      }>,
    ) => void | Promise<void>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        results.push(await statement.withClient(client).run());
      }
      await postcondition(results);
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function toPostgresParameters(sql: string) {
  let index = 0;
  return sql
    .replace(/GROUP_CONCAT\(([^)]+)\)/gi, "string_agg($1, ',')")
    .replace(/\?/g, () => `$${++index}`);
}

export function toPostgresValue(value: BoundValue) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}
