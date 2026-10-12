#!/usr/bin/env bash
# สำรองฐานข้อมูลชุดใช้งานจริงเป็นไฟล์ SQL 3 ไฟล์ตามวิธีของ Supabase (บทที่ 32)
# ใช้: PROD_DB_URL=... bash scripts/ops/backup-db.sh <โฟลเดอร์ปลายทาง>
# ต้องมี Supabase CLI (ใช้ Docker) และ psql  ใน GitHub Actions ติดตั้งให้แล้ว
set -euo pipefail
OUT="${1:?ระบุโฟลเดอร์ปลายทาง}"
: "${PROD_DB_URL:?ไม่พบ PROD_DB_URL}"
mkdir -p "$OUT"
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT/roles.sql" --role-only
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT/schema.sql"
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
# ประวัติ migration (ใช้ตรวจว่าฐานที่กู้คืนอยู่รุ่นเดียวกัน)
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT/history_data.sql" --use-copy --data-only --schema supabase_migrations
psql "$PROD_DB_URL" -At -v ON_ERROR_STOP=1 -f scripts/ops/row-counts.sql > "$OUT/row-counts.txt"
# ส่วนขยายที่ใช้ (ต้องเปิดในโครงการปลายทางก่อนกู้คืน เช่น pg_trgm ของการค้นชื่อ)
psql "$PROD_DB_URL" -At -v ON_ERROR_STOP=1 -c "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname not in ('plpgsql') order by 1" > "$OUT/extensions.sql"
# สิทธิ์ของทุกตารางและฟังก์ชัน: acl.sql ใช้ตั้งสิทธิ์ให้ตรงต้นทางตอนกู้คืน (โครงการใหม่ให้สิทธิ์ anon/authenticated อัตโนมัติ) acl-list.txt ใช้ตรวจผล
psql "$PROD_DB_URL" -At -v ON_ERROR_STOP=1 -f scripts/ops/acl-sync.sql > "$OUT/acl.sql"
psql "$PROD_DB_URL" -At -v ON_ERROR_STOP=1 -f scripts/ops/acl-list.sql > "$OUT/acl-list.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$OUT/created-at.txt"
echo "สำรองฐานข้อมูลแล้ว: $(wc -l < "$OUT/row-counts.txt") ตาราง"
