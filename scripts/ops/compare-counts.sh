#!/usr/bin/env bash
# เทียบจำนวนแถวต่อตาราง (ก่อนสำรอง กับ หลังกู้คืน) ไม่ตรงแม้ตารางเดียว = ล้มเหลว
# ตารางที่ระบบของ Supabase สร้างใหม่เองในโครงการปลายทาง (auth.mfa_factors ของผู้กู้ ฯลฯ) ไม่อยู่ในรายการเทียบ
set -euo pipefail
before="${1:?}"; after="${2:?}"
if diff <(sort "$before") <(sort "$after") > /tmp/count-diff.txt; then
  echo "กู้คืนสำเร็จ: จำนวนแถวตรงกันทุกตาราง ($(wc -l < "$before") ตาราง รวม $(awk '{s+=$2} END {print s}' "$before") แถว)"
else
  echo "จำนวนแถวไม่ตรงกัน:"; cat /tmp/count-diff.txt; exit 1
fi
