#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

ts=$(date +%Y%m%d_%H%M%S)

# Back up the tenant registry plus every database it points at: the default
# tenant's file and one file per additional tenant under data/tenants/.
targets=()
[ -f data/registry.db ] && targets+=("data/registry.db")
[ -f data/nexusfit.db ] && targets+=("data/nexusfit.db")
if [ -d data/tenants ]; then
  while IFS= read -r -d '' file; do
    targets+=("$file")
  done < <(find data/tenants -name '*.db' -print0)
fi

if [ ${#targets[@]} -gt 0 ]; then
  tar -czf "$BACKUP_DIR/nexusfit_db_${ts}.tar.gz" "${targets[@]}"
  echo "backup done: $BACKUP_DIR (${#targets[@]} database files)"
else
  echo "no databases found to back up"
fi

find "$BACKUP_DIR" -name 'nexusfit_db_*.tar.gz' -mtime +14 -delete
