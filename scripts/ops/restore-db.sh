#!/usr/bin/env bash
# กู้คืนฐานข้อมูลจากไฟล์สำรองลงโครงการ Supabase ที่ว่าง (บทที่ 32) แล้วเทียบจำนวนแถวทุกตารางกับตอนสำรอง
# ใช้: TARGET_DB_URL=... bash scripts/ops/restore-db.sh <โฟลเดอร์ไฟล์สำรองที่ถอดรหัสแล้ว>
# ปลายทางต้องเป็นโครงการใหม่ที่ยังไม่มีตารางของเว็บ (ห้ามกู้ทับชุดใช้งานจริงที่ยังมีข้อมูล)
set -euo pipefail
DIR="${1:?ระบุโฟลเดอร์ไฟล์สำรอง}"
: "${TARGET_DB_URL:?ไม่พบ TARGET_DB_URL}"
if [ "$(psql "$TARGET_DB_URL" -At -c "select count(*) from information_schema.tables where table_schema='public'")" != "0" ]; then
  echo "หยุด: ฐานข้อมูลปลายทางมีตารางอยู่แล้ว ให้ใช้โครงการใหม่ที่ว่าง"; exit 1
fi
# คำสั่งเฉพาะ Postgres 17 ไม่กระทบ แต่ปิดไว้เพื่อให้กู้ลงรุ่นอื่นได้
sed -i 's/^SET transaction_timeout/-- &/' "$DIR/data.sql"
# เปิดส่วนขยายเดียวกับต้นทางก่อน (ส่วนขยายที่มีอยู่แล้วถูกข้าม ที่ไม่มีในปลายทางให้หยุดแล้วเปิดเองที่หน้า Database > Extensions)
for f in roles.sql schema.sql data.sql acl.sql acl-list.txt row-counts.txt; do
  [ -f "$DIR/$f" ] || { echo "หยุด: ไม่พบ $f ในไฟล์สำรอง (ไฟล์สำรองก่อนบทที่ 32 ฉบับแก้ ไม่มี acl.sql ให้สำรองใหม่)"; exit 1; }
done
if [ -f "$DIR/extensions.sql" ]; then
  psql --variable ON_ERROR_STOP=1 --file "$DIR/extensions.sql" --dbname "$TARGET_DB_URL"
fi
psql --single-transaction --quiet --variable ON_ERROR_STOP=1 \
  --file "$DIR/roles.sql" \
  --file "$DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$DIR/data.sql" \
  --command 'SET session_replication_role = origin' \
  --file "$DIR/acl.sql" \
  --dbname "$TARGET_DB_URL"
if [ -f "$DIR/history_schema.sql" ]; then
  psql --single-transaction --variable ON_ERROR_STOP=1 --file "$DIR/history_schema.sql" --file "$DIR/history_data.sql" --dbname "$TARGET_DB_URL"
fi
psql "$TARGET_DB_URL" -At -v ON_ERROR_STOP=1 -f scripts/ops/row-counts.sql > "$DIR/row-counts-restored.txt"
bash scripts/ops/compare-counts.sh "$DIR/row-counts.txt" "$DIR/row-counts-restored.txt"
# สิทธิ์ต้องตรงต้นทางทุกบรรทัด (ถ้าไม่ตรง ห้ามเปิดใช้ฐานนี้ อาจมีตารางที่บุคคลทั่วไปอ่านได้)
psql "$TARGET_DB_URL" -At -v ON_ERROR_STOP=1 -f scripts/ops/acl-list.sql > "$DIR/acl-list-restored.txt"
if diff -q "$DIR/acl-list.txt" "$DIR/acl-list-restored.txt" > /dev/null; then
  echo "สิทธิ์ตรงต้นทางทุกวัตถุ ($(wc -l < "$DIR/acl-list.txt") รายการ)"
else
  echo "สิทธิ์ไม่ตรงต้นทาง:"; diff "$DIR/acl-list.txt" "$DIR/acl-list-restored.txt" | head -20; exit 1
fi
