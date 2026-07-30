#!/bin/sh
set -eu

trust_database="${HOME}/.pki/nssdb"
mkdir -p "${trust_database}"
if [ ! -f "${trust_database}/cert9.db" ]; then
  certutil -N --empty-password -d "sql:${trust_database}"
fi
certutil -D -d "sql:${trust_database}" -n "Project 42 local HTTPS" \
  >/dev/null 2>&1 || true
certutil -A \
  -d "sql:${trust_database}" \
  -n "Project 42 local HTTPS" \
  -t "C,," \
  -i /trust/root.crt

exec node /smoke/smoke-secure-browser-session.mjs
