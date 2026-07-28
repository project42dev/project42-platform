import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const PROFILE_PHOTO_KEY =
  /^profiles\/[a-f0-9]{16}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/;

export class FilesystemProfilePhotoBucket {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null> {
    const path = this.resolveKey(key);
    try {
      const bytes = await readFile(path);
      return { body: new Blob([new Uint8Array(bytes)]).stream() };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async put(key: string, value: ArrayBuffer): Promise<{ etag: string }> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    const bytes = new Uint8Array(value);
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      etag: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (!PROFILE_PHOTO_KEY.test(key)) {
      throw new Error("Profile photo key does not match the supported storage contract");
    }
    const path = resolve(this.root, ...key.split("/"));
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new Error("Profile photo key escaped the configured storage directory");
    }
    return path;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
