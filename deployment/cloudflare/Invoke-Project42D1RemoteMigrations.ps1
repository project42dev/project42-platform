#requires -Version 7.0

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    [string] $Database,

    [Parameter()]
    [string] $MigrationsDirectory = (
        Join-Path $PSScriptRoot '..\..\migrations'
    ),

    [Parameter()]
    [string] $ConfigurationPath,

    [Parameter()]
    [string] $WranglerCommand,

    [Parameter()]
    [switch] $AdoptExistingLedger,

    [Parameter()]
    [switch] $Plan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$migrationNamePattern = '^\d{4}_[a-z0-9_-]+\.sql$'
$checksumPattern = '^[a-f0-9]{64}$'

function ConvertTo-SqlLiteral {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Value
    )

    return "'{0}'" -f $Value.Replace("'", "''")
}

function Invoke-D1JsonQuery {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Sql
    )

    $arguments = @(
        'd1',
        'execute',
        $Database,
        '--remote',
        '--json',
        '--command',
        $Sql
    )
    if ($ConfigurationPath) {
        $arguments += @('--config', $ConfigurationPath)
    }

    $output = @(& $WranglerCommand @arguments)
    if ($LASTEXITCODE -ne 0) {
        throw 'The remote D1 validation query failed.'
    }
    try {
        return @($output -join [Environment]::NewLine | ConvertFrom-Json)
    }
    catch {
        throw 'The remote D1 validation query did not return valid JSON.'
    }
}

function Get-D1Rows {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Sql
    )

    $responses = @(Invoke-D1JsonQuery -Sql $Sql)
    $rows = [System.Collections.Generic.List[object]]::new()
    foreach ($response in $responses) {
        if (-not $response.success) {
            throw 'The remote D1 validation query reported failure.'
        }
        foreach ($row in @($response.results)) {
            if ($null -ne $row) {
                $rows.Add($row)
            }
        }
    }
    return @($rows)
}

function Invoke-D1Import {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Description
    )

    if (-not $PSCmdlet.ShouldProcess($Database, $Description)) {
        return
    }
    $arguments = @(
        'd1',
        'execute',
        $Database,
        '--remote',
        '--file',
        $Path
    )
    if ($ConfigurationPath) {
        $arguments += @('--config', $ConfigurationPath)
    }

    $output = @(& $WranglerCommand @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $safeDetail = @(
            $output |
                ForEach-Object { [string] $_ } |
                Where-Object {
                    $_ -match 'ERROR|failed|incomplete|syntax|constraint|rollback'
                } |
                Select-Object -Last 5
        ) -join ' '
        if ($safeDetail) {
            throw "The atomic remote D1 import failed: $safeDetail"
        }
        throw 'The atomic remote D1 import failed.'
    }
}

function New-LedgerPreamble {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [System.Collections.IDictionary] $Digests,

        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [string[]] $AdoptedNames
    )

    $statements = @(
        @'
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
'@,
        @'
CREATE TABLE IF NOT EXISTS project42_migration_checksums (
  name TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^a-f0-9]*'
  ),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
'@
    )
    foreach ($name in $AdoptedNames) {
        $statements += @"
INSERT INTO project42_migration_checksums (name, sha256)
VALUES ($(ConvertTo-SqlLiteral $name), $(ConvertTo-SqlLiteral $Digests[$name]))
ON CONFLICT (name) DO NOTHING;
"@
    }
    return $statements -join [Environment]::NewLine
}

$resolvedMigrations = (Resolve-Path -LiteralPath $MigrationsDirectory).Path
$migrationFiles = @(
    Get-ChildItem -LiteralPath $resolvedMigrations -File -Filter '*.sql' |
        Where-Object { $_.Name -match $migrationNamePattern } |
        Sort-Object Name
)
if ($migrationFiles.Count -eq 0) {
    throw "No Project 42 migrations were found in $resolvedMigrations."
}
if ($migrationFiles.Count -ne @(
    Get-ChildItem -LiteralPath $resolvedMigrations -File -Filter '*.sql'
).Count) {
    throw 'Every SQL migration filename must use the supported ordered format.'
}

if (-not $WranglerCommand) {
    $repositoryRoot = (Resolve-Path -LiteralPath (
        Join-Path $PSScriptRoot '..\..'
    )).Path
    $candidate = if ($IsWindows) {
        Join-Path $repositoryRoot 'node_modules\.bin\wrangler.cmd'
    }
    else {
        Join-Path $repositoryRoot 'node_modules\.bin\wrangler'
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw 'Wrangler is not installed. Run npm ci before remote migration.'
    }
    $WranglerCommand = $candidate
}
elseif (-not (Get-Command $WranglerCommand -ErrorAction SilentlyContinue)) {
    throw "Wrangler command not found: $WranglerCommand"
}

if ($ConfigurationPath) {
    $ConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
}

$digests = [ordered]@{}
foreach ($migration in $migrationFiles) {
    $digest = (
        Get-FileHash -LiteralPath $migration.FullName -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($digest -notmatch $checksumPattern) {
        throw "Could not calculate a valid checksum for $($migration.Name)."
    }
    $digests[$migration.Name] = $digest
}

$ledgerExists = @(
    Get-D1Rows -Sql (
        "SELECT name FROM sqlite_master " +
        "WHERE type = 'table' AND name = 'd1_migrations';"
    )
).Count -eq 1
$ledger = if ($ledgerExists) {
    @(
        Get-D1Rows -Sql (
            'SELECT id, name FROM d1_migrations ORDER BY id ASC;'
        )
    )
}
else {
    @()
}

$ledgerNames = @($ledger | ForEach-Object { [string] $_.name })
if ($ledgerNames.Count -ne @($ledgerNames | Sort-Object -Unique).Count) {
    throw 'The D1 migration ledger contains duplicate names.'
}
for ($index = 0; $index -lt $ledgerNames.Count; $index += 1) {
    if (
        $index -ge $migrationFiles.Count -or
        $ledgerNames[$index] -ne $migrationFiles[$index].Name
    ) {
        throw 'The D1 migration ledger is unknown, missing, or out of order.'
    }
}

$checksumTableExists = @(
    Get-D1Rows -Sql (
        "SELECT name FROM sqlite_master WHERE type = 'table' " +
        "AND name = 'project42_migration_checksums';"
    )
).Count -eq 1
$checksumRows = if ($checksumTableExists) {
    @(
        Get-D1Rows -Sql (
            'SELECT name, sha256 FROM project42_migration_checksums ORDER BY name;'
        )
    )
}
else {
    @()
}
$checksumByName = @{}
foreach ($row in $checksumRows) {
    $name = [string] $row.name
    $sha256 = [string] $row.sha256
    if (-not $digests.Contains($name) -or $name -notin $ledgerNames) {
        throw 'The checksum ledger contains an unknown or unapplied migration.'
    }
    if ($sha256 -ne $digests[$name]) {
        throw "Applied migration checksum drift detected for $name."
    }
    $checksumByName[$name] = $sha256
}

$unboundNames = @(
    $ledgerNames | Where-Object { -not $checksumByName.ContainsKey($_) }
)
if ($unboundNames.Count -gt 0 -and -not $AdoptExistingLedger) {
    throw (
        'Applied migrations lack checksum bindings. Re-run once with ' +
        '-AdoptExistingLedger only after exact-release verification.'
    )
}

$pending = @($migrationFiles | Select-Object -Skip $ledgerNames.Count)
$planResult = [ordered]@{
    schemaVersion = '1.0'
    applied       = $ledgerNames
    pending       = @($pending | ForEach-Object { $_.Name })
    adopt         = $unboundNames
}
if ($Plan) {
    $planResult | ConvertTo-Json -Depth 4
    return
}

$workDirectory = Join-Path $resolvedMigrations (
    '.project42-migration-work-{0}' -f [guid]::NewGuid().ToString('N')
)
$resolvedWorkParent = [System.IO.Path]::GetFullPath($resolvedMigrations).
    TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
    [System.IO.Path]::DirectorySeparatorChar
$fullWorkDirectory = [System.IO.Path]::GetFullPath($workDirectory)
if (-not $fullWorkDirectory.StartsWith(
    $resolvedWorkParent,
    [StringComparison]::OrdinalIgnoreCase
)) {
    throw 'Generated migration work directory escaped the migration directory.'
}
if (Test-Path -LiteralPath $workDirectory) {
    throw "Generated migration work directory already exists: $workDirectory"
}

New-Item -ItemType Directory -Path $workDirectory | Out-Null
try {
    if ($pending.Count -eq 0 -and $unboundNames.Count -gt 0) {
        $bootstrapPath = Join-Path $workDirectory 'checksum-ledger-bootstrap.sql'
        New-LedgerPreamble -Digests $digests -AdoptedNames $unboundNames |
            Set-Content -LiteralPath $bootstrapPath -Encoding utf8NoBOM
        Invoke-D1Import `
            -Path $bootstrapPath `
            -Description 'adopt the verified existing migration ledger'
    }

    foreach ($migration in $pending) {
        $packagePath = Join-Path $workDirectory $migration.Name
        $migrationSql = Get-Content -LiteralPath $migration.FullName -Raw
        $preamble = New-LedgerPreamble `
            -Digests $digests `
            -AdoptedNames $unboundNames
        $package = @"
$preamble
$migrationSql
INSERT INTO d1_migrations (name)
VALUES ($(ConvertTo-SqlLiteral $migration.Name));
INSERT INTO project42_migration_checksums (name, sha256)
VALUES (
  $(ConvertTo-SqlLiteral $migration.Name),
  $(ConvertTo-SqlLiteral $digests[$migration.Name])
);
"@
        Set-Content `
            -LiteralPath $packagePath `
            -Value $package `
            -Encoding utf8NoBOM
        Invoke-D1Import `
            -Path $packagePath `
            -Description "apply migration $($migration.Name)"
        $unboundNames = @()
    }
}
finally {
    if (Test-Path -LiteralPath $workDirectory -PathType Container) {
        $verifiedWorkDirectory = [System.IO.Path]::GetFullPath(
            (Resolve-Path -LiteralPath $workDirectory).Path
        )
        if (-not $verifiedWorkDirectory.StartsWith(
            $resolvedWorkParent,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw 'Refusing to remove an unverified migration work directory.'
        }
        Remove-Item -LiteralPath $verifiedWorkDirectory -Recurse -Force
    }
}

$finalLedger = @(
    Get-D1Rows -Sql 'SELECT id, name FROM d1_migrations ORDER BY id ASC;'
)
$finalChecksums = @(
    Get-D1Rows -Sql (
        'SELECT name, sha256 FROM project42_migration_checksums ORDER BY name;'
    )
)
if (
    $finalLedger.Count -ne $migrationFiles.Count -or
    $finalChecksums.Count -ne $migrationFiles.Count
) {
    throw 'Remote D1 migration validation found an incomplete ledger.'
}
for ($index = 0; $index -lt $migrationFiles.Count; $index += 1) {
    $name = $migrationFiles[$index].Name
    if (
        [string] $finalLedger[$index].name -ne $name -or
        [string] (
            $finalChecksums | Where-Object name -eq $name
        ).sha256 -ne $digests[$name]
    ) {
        throw "Remote D1 migration validation failed for $name."
    }
}

[ordered]@{
    schemaVersion = '1.0'
    migrationCount = $finalLedger.Count
    migrationHead = $finalLedger[-1].name
    checksumsVerified = $finalChecksums.Count
} | ConvertTo-Json
