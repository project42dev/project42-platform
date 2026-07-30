#!/bin/sh
set -eu

backup_directory=/evidence
restore_database=project42_restore_acceptance
fixture_table=project42_backup_restore_acceptance

directory_manifest() {
  directory="$1"
  (
    cd "${directory}"
    find . -type d -print | sort
    find . -type l -print | sort |
      while IFS= read -r link; do
        printf 'link %s -> %s\n' "${link}" "$(readlink "${link}")"
      done
    find . -type f -print0 | sort -z |
      xargs -0 -r sha256sum
  )
}

cleanup() {
  PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" dropdb \
    --if-exists \
    --force \
    --host=database \
    --username=project42 \
    "${restore_database}" >/dev/null 2>&1 || true
  PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" psql \
    --host=database \
    --username=project42 \
    --dbname=project42 \
    --set=ON_ERROR_STOP=1 \
    --command="DROP TABLE IF EXISTS ${fixture_table}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

umask 077
mkdir -p \
  "${backup_directory}" \
  /restored-photos \
  /restored-identity \
  /restored-caddy-data \
  /restored-caddy-config
rm -rf \
  "${backup_directory:?}/"* \
  /restored-photos/* \
  /restored-identity/* \
  /restored-caddy-data/* \
  /restored-caddy-config/*

fixture_value="secure-backup-$(date +%s)-$$"

PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" psql \
  --host=database \
  --username=project42 \
  --dbname=project42 \
  --set=ON_ERROR_STOP=1 <<SQL
DROP TABLE IF EXISTS ${fixture_table};
CREATE TABLE ${fixture_table} (value text PRIMARY KEY);
INSERT INTO ${fixture_table} (value) VALUES ('${fixture_value}');
SQL

PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" pg_dump \
  --format=custom \
  --no-owner \
  --host=database \
  --username=project42 \
  --dbname=project42 \
  --file="${backup_directory}/project42.pgdump"

for asset in photos identity caddy-data caddy-config; do
  source="/source-${asset}"
  restored="/restored-${asset}"
  archive="${backup_directory}/${asset}.tgz"
  tar -C "${source}" -czf "${archive}" .
  tar -C "${restored}" -xzf "${archive}"
  directory_manifest "${source}" > "${backup_directory}/${asset}.source.manifest"
  directory_manifest "${restored}" > "${backup_directory}/${asset}.restored.manifest"
  cmp \
    "${backup_directory}/${asset}.source.manifest" \
    "${backup_directory}/${asset}.restored.manifest"
done

test "$(find /source-identity -type f | wc -l)" -gt 0
test "$(find /source-caddy-data -type f | wc -l)" -gt 0
test "$(find /source-caddy-config -type f | wc -l)" -gt 0

find "${backup_directory}" -type f ! -name SHA256SUMS \
  -exec sha256sum {} + |
  sed "s#${backup_directory}/##" |
  sort > "${backup_directory}/SHA256SUMS"
(cd "${backup_directory}" && sha256sum --check SHA256SUMS)

PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" createdb \
  --host=database \
  --username=project42 \
  --template=template0 \
  "${restore_database}"
PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" pg_restore \
  --exit-on-error \
  --no-owner \
  --host=database \
  --username=project42 \
  --dbname="${restore_database}" \
  "${backup_directory}/project42.pgdump"

restored_fixture="$(
  PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" psql \
    --host=database \
    --username=project42 \
    --dbname="${restore_database}" \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="SELECT value FROM ${fixture_table}"
)"
test "${restored_fixture}" = "${fixture_value}"

source_migrations="$(
  PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" psql \
    --host=database \
    --username=project42 \
    --dbname=project42 \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="SELECT count(*) FROM project42_schema_migrations"
)"
restored_migrations="$(
  PGPASSWORD="${PROJECT42_DATABASE_PASSWORD}" psql \
    --host=database \
    --username=project42 \
    --dbname="${restore_database}" \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="SELECT count(*) FROM project42_schema_migrations"
)"
test "${source_migrations}" = "${restored_migrations}"
test "${restored_migrations}" -gt 0

echo "Verified checksum-locked database, photo, identity, and Caddy backup/restore."
