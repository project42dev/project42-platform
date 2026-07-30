import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const runner = resolve(
  "deployment/cloudflare/Invoke-Project42D1RemoteMigrations.ps1",
);

const fakeWrangler = String.raw`#Requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$statePath = $env:PROJECT42_FAKE_D1_STATE
if (-not $statePath) {
    throw 'PROJECT42_FAKE_D1_STATE is required.'
}
$state = if (Test-Path -LiteralPath $statePath) {
    Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
}
else {
    [pscustomobject]@{
        ledger = @()
        checksums = [pscustomobject]@{}
    }
}

$commandIndex = [Array]::IndexOf($args, '--command')
$fileIndex = [Array]::IndexOf($args, '--file')
if ($commandIndex -ge 0) {
    $sql = $args[$commandIndex + 1]
    $results = if ($sql -match "sqlite_master.+d1_migrations") {
        if (@($state.ledger).Count -gt 0) {
            @([pscustomobject]@{ name = 'd1_migrations' })
        }
        else {
            @()
        }
    }
    elseif ($sql -match "sqlite_master.+project42_migration_checksums") {
        if (@($state.checksums.psobject.Properties).Count -gt 0) {
            @([pscustomobject]@{ name = 'project42_migration_checksums' })
        }
        else {
            @()
        }
    }
    elseif ($sql -match 'FROM d1_migrations') {
        @(
            for ($index = 0; $index -lt @($state.ledger).Count; $index += 1) {
                [pscustomobject]@{
                    id = $index + 1
                    name = [string] $state.ledger[$index]
                }
            }
        )
    }
    elseif ($sql -match 'FROM project42_migration_checksums') {
        @(
            $state.checksums.psobject.Properties |
                Sort-Object Name |
                ForEach-Object {
                    [pscustomobject]@{
                        name = $_.Name
                        sha256 = [string] $_.Value
                    }
                }
        )
    }
    else {
        throw "Unsupported fake query: $sql"
    }
    @([pscustomobject]@{ success = $true; results = $results }) |
        ConvertTo-Json -Depth 8 -Compress
    exit 0
}

if ($fileIndex -lt 0) {
    throw 'The fake Wrangler supports only --command and --file.'
}
$sqlFile = $args[$fileIndex + 1]
$sql = Get-Content -Raw -LiteralPath $sqlFile
$failureName = $env:PROJECT42_FAKE_D1_FAIL_MIGRATION
if ($failureName -and $sql -match [regex]::Escape($failureName)) {
    [Console]::Error.WriteLine('ERROR simulated atomic import rollback')
    exit 1
}

$ledgerMatches = [regex]::Matches(
    $sql,
    "INSERT INTO d1_migrations \(name\)\s*VALUES \('([^']+)'\);"
)
$checksumMatches = [regex]::Matches(
    $sql,
    "INSERT INTO project42_migration_checksums \(name, sha256\)\s*" +
    "VALUES \(\s*'([^']+)',\s*'([a-f0-9]{64})'\s*\)"
)
$nextLedger = @($state.ledger)
foreach ($match in $ledgerMatches) {
    $name = $match.Groups[1].Value
    if ($name -notin $nextLedger) {
        $nextLedger += $name
    }
}
$nextChecksums = [ordered]@{}
foreach ($property in $state.checksums.psobject.Properties) {
    $nextChecksums[$property.Name] = [string] $property.Value
}
foreach ($match in $checksumMatches) {
    $nextChecksums[$match.Groups[1].Value] = $match.Groups[2].Value
}
[pscustomobject]@{
    ledger = $nextLedger
    checksums = [pscustomobject] $nextChecksums
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath
exit 0
`;

function runPowerShell(arguments_, environment = {}) {
  return new Promise((accept, reject) => {
    const child = spawn("pwsh", ["-NoProfile", "-File", runner, ...arguments_], {
      env: { ...process.env, ...environment },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => accept({ code, stdout, stderr }));
  });
}

async function createFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "project42-d1-runner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const migrations = join(directory, "migrations");
  const state = join(directory, "state.json");
  const fake = join(directory, "fake-wrangler.ps1");
  await mkdir(migrations, { recursive: true });
  await writeFile(
    join(migrations, "0001_initial.sql"),
    "CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);\n",
  );
  await writeFile(
    join(migrations, "0002_trigger.sql"),
    `CREATE TRIGGER records_immutable
BEFORE UPDATE ON records
BEGIN
  SELECT RAISE(ABORT, 'records are immutable');
END;\n`,
  );
  await writeFile(fake, fakeWrangler);
  return { migrations, state, fake };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("remote runner applies trigger migrations, verifies checksums, and reruns", async (t) => {
  const fixture = await createFixture(t);
  const arguments_ = [
    "-Database",
    "test-database",
    "-MigrationsDirectory",
    fixture.migrations,
    "-WranglerCommand",
    fixture.fake,
  ];
  const environment = { PROJECT42_FAKE_D1_STATE: fixture.state };
  const first = await runPowerShell(arguments_, environment);
  assert.equal(first.code, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.equal(result.migrationCount, 2);
  assert.equal(result.migrationHead, "0002_trigger.sql");
  assert.equal(result.checksumsVerified, 2);

  const state = JSON.parse(await readFile(fixture.state, "utf8"));
  assert.deepEqual(state.ledger, ["0001_initial.sql", "0002_trigger.sql"]);
  assert.deepEqual(Object.keys(state.checksums).sort(), state.ledger);

  const second = await runPowerShell(arguments_, environment);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).migrationCount, 2);
});

test("remote runner rejects unbound and drifted existing ledgers", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    fixture.state,
    JSON.stringify({ ledger: ["0001_initial.sql"], checksums: {} }),
  );
  const arguments_ = [
    "-Database",
    "test-database",
    "-MigrationsDirectory",
    fixture.migrations,
    "-WranglerCommand",
    fixture.fake,
  ];
  const environment = { PROJECT42_FAKE_D1_STATE: fixture.state };
  const rejected = await runPowerShell(arguments_, environment);
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /lack checksum bindings/);

  const adopted = await runPowerShell(
    [...arguments_, "-AdoptExistingLedger"],
    environment,
  );
  assert.equal(adopted.code, 0, adopted.stderr);

  const state = JSON.parse(await readFile(fixture.state, "utf8"));
  state.checksums["0001_initial.sql"] = "0".repeat(64);
  await writeFile(fixture.state, JSON.stringify(state));
  const drifted = await runPowerShell(arguments_, environment);
  assert.notEqual(drifted.code, 0);
  assert.match(drifted.stderr, /checksum drift/);
});

test("remote runner accepts legacy LF and CRLF checksums without rewriting the ledger", async (t) => {
  const fixture = await createFixture(t);
  const names = ["0001_initial.sql", "0002_trigger.sql"];
  const lfContents = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        await readFile(join(fixture.migrations, name), "utf8"),
      ]),
    ),
  );
  const legacyCrLfChecksums = Object.fromEntries(
    names.map((name) => [
      name,
      sha256(lfContents[name].replace(/\n/g, "\r\n")),
    ]),
  );
  await writeFile(
    fixture.state,
    JSON.stringify({ ledger: names, checksums: legacyCrLfChecksums }),
  );
  const arguments_ = [
    "-Database",
    "test-database",
    "-MigrationsDirectory",
    fixture.migrations,
    "-WranglerCommand",
    fixture.fake,
    "-Plan",
  ];
  const environment = { PROJECT42_FAKE_D1_STATE: fixture.state };

  const lfCheckout = await runPowerShell(arguments_, environment);
  assert.equal(lfCheckout.code, 0, lfCheckout.stderr);
  assert.equal(
    JSON.parse(lfCheckout.stdout).checksumContract,
    "sha256-normalized-lf-v1",
  );
  assert.deepEqual(
    JSON.parse(await readFile(fixture.state, "utf8")).checksums,
    legacyCrLfChecksums,
    "read-only validation must not rewrite legacy checksum records",
  );

  for (const name of names) {
    await writeFile(
      join(fixture.migrations, name),
      lfContents[name].replace(/\n/g, "\r\n"),
    );
  }
  const legacyLfChecksums = Object.fromEntries(
    names.map((name) => [name, sha256(lfContents[name])]),
  );
  await writeFile(
    fixture.state,
    JSON.stringify({ ledger: names, checksums: legacyLfChecksums }),
  );
  const crLfCheckout = await runPowerShell(arguments_, environment);
  assert.equal(crLfCheckout.code, 0, crLfCheckout.stderr);
  assert.deepEqual(
    JSON.parse(await readFile(fixture.state, "utf8")).checksums,
    legacyLfChecksums,
    "the opposite checkout line ending must also preserve the ledger",
  );

  await writeFile(
    join(fixture.migrations, names[0]),
    `${lfContents[names[0]]}-- substantive drift\n`,
  );
  const substantiveDrift = await runPowerShell(arguments_, environment);
  assert.notEqual(substantiveDrift.code, 0);
  assert.match(substantiveDrift.stderr, /checksum drift/);
});

test("remote runner preserves the last successful ledger on import failure", async (t) => {
  const fixture = await createFixture(t);
  const arguments_ = [
    "-Database",
    "test-database",
    "-MigrationsDirectory",
    fixture.migrations,
    "-WranglerCommand",
    fixture.fake,
  ];
  const failed = await runPowerShell(arguments_, {
    PROJECT42_FAKE_D1_STATE: fixture.state,
    PROJECT42_FAKE_D1_FAIL_MIGRATION: "0002_trigger.sql",
  });
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /atomic remote D1 import failed/);
  const state = JSON.parse(await readFile(fixture.state, "utf8"));
  assert.deepEqual(state.ledger, ["0001_initial.sql"]);
  assert.deepEqual(Object.keys(state.checksums), ["0001_initial.sql"]);
});
