#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""สร้างเอกสารโครงสร้างฐานข้อมูล docs/maintainer/database.md จากฐานข้อมูลจริงหรือฐานทดสอบ (บทที่ 32)

อ่านเฉพาะโครงสร้าง (ชื่อตาราง คอลัมน์ คำอธิบาย ความสัมพันธ์ policy trigger) ไม่อ่านข้อมูลในตาราง
ใช้: python3 -I scripts/ops/db-doc.py "<สตริงเชื่อมต่อ psql>" docs/maintainer/database.md
สร้างใหม่ทุกครั้งที่เพิ่ม migration ที่เปลี่ยนตาราง
"""
import collections
import json
import subprocess
import sys

DSN, OUT = sys.argv[1], sys.argv[2]

# จัดกลุ่มตารางตามระบบ (ตารางที่ไม่อยู่ในรายการไปอยู่หมวด อื่น ๆ)
GROUPS = [
    ("แกนกลาง: ผู้ใช้ สิทธิ์ เขตปกครอง", ["profiles", "roles", "user_roles", "role_menus", "org_units", "account_requests",
                                       "access_review_rounds", "access_review_decisions", "app_settings", "audit_logs",
                                       "notifications", "attachments"]),
    ("เครื่องอนุมัติกลาง (คำขอทุกชนิด)", ["request_types", "requests", "request_steps", "request_events", "request_counters",
                                       "request_document_types"]),
    ("ระบบที่ 1 ทะเบียนบุคคล", ["persons", "position_types", "appointments", "status_changes", "education_position_types",
                              "education_staff"]),
    ("ระบบที่ 2 ทะเบียนสถานที่และสนามสอบ", ["civil_provinces", "civil_districts", "civil_subdistricts", "places", "exam_venues",
                                         "venue_officers", "exam_venue_changes"]),
    ("ระบบที่ 3 คลังข้อสอบและการเรียน", ["courses", "units", "questions", "lessons", "quiz_attempts"]),
    ("ระบบที่ 5 และ 9 สมัครสอบ ผลสอบ", ["academic_years", "form_templates", "form_title_options", "exam_rounds",
                                     "registration_batches", "registration_files", "candidates", "candidate_code_counters",
                                     "registration_changes", "exam_results", "exam_result_changes", "exam_pass_history",
                                     "exam_result_forms"]),
    ("ระบบที่ 6 งบประมาณ", ["fiscal_years", "budget_sources", "budget_categories", "budget_items", "budget_allocations",
                          "budget_transfers", "budget_item_changes", "budget_approval_limits", "budget_use_requests",
                          "budget_disbursements", "budget_year_closings", "budget_alerts"]),
    ("ระบบที่ 7 พัสดุ ครุภัณฑ์", ["inventory_categories", "items", "warehouses", "stock_receipts", "stock_transfers",
                               "requisitions", "stock_moves", "asset_types", "assets", "asset_transfers", "asset_loans",
                               "asset_repairs", "asset_counts", "asset_count_items"]),
    ("ระบบที่ 8 สารบรรณ", ["documents", "document_viewers", "document_deliveries", "document_routes", "doc_counters",
                         "doc_unit_settings", "document_close_events", "doc_retention_rules", "document_request_links"]),
    ("หน้าสาธารณะ ติดต่อเรา ข้อมูลส่วนบุคคล ติดตามระบบ", ["announcements", "announcement_files", "downloads",
                                                       "exam_calendar_events", "site_contact", "contact_topics",
                                                       "contact_topic_recipients", "contact_messages", "privacy_texts",
                                                       "person_access_logs", "data_retention_rules", "app_error_logs"]),
]


def q(sql):
    r = subprocess.run(["psql", DSN, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr)
    return r.stdout.strip()


rows = json.loads(q("""
select coalesce(json_agg(t order by t.name), '[]') from (
  select c.relname as name, coalesce(obj_description(c.oid, 'pg_class'), '') as comment, c.relrowsecurity as rls,
    (select json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
            'null', not a.attnotnull, 'comment', coalesce(col_description(c.oid, a.attnum), '')) order by a.attnum)
     from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
    (select json_agg(json_build_object('col', (select string_agg(attname, ', ') from pg_attribute where attrelid = k.conrelid and attnum = any(k.conkey)),
            'ref', k.confrelid::regclass::text) order by k.conname)
     from pg_constraint k where k.conrelid = c.oid and k.contype = 'f') as fks,
    (select json_agg(p.policyname || ' (' || p.cmd || ')' order by p.policyname) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as policies,
    (select json_agg(t.tgname order by t.tgname) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as triggers
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
) t"""))
funcs = q("select count(*) from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace)")
migr = q("select count(*) from supabase_migrations.schema_migrations") if q(
    "select count(*) from pg_namespace where nspname = 'supabase_migrations'") == "1" else "-"

by_name = {r["name"]: r for r in rows}
placed = set()
out = [
    "# โครงสร้างฐานข้อมูล",
    "",
    "สร้างอัตโนมัติด้วย `scripts/ops/db-doc.py` จากฐานข้อมูล (อย่าแก้ไฟล์นี้เอง ให้แก้คำอธิบายใน migration ด้วย `comment on` แล้วสร้างใหม่)",
    "",
    f"ตารางใน schema public {len(rows)} ตาราง · เปิด RLS {sum(1 for r in rows if r['rls'])} ตาราง · ฟังก์ชัน (public + private) {funcs} ฟังก์ชัน",
    "",
    "หลักที่ใช้ทั้งระบบ: ทุกตารางเปิด RLS สิทธิ์ = บทบาท + เขตปกครอง / ทุกการเพิ่ม แก้ไข ลบ บันทึกใน `audit_logs` ด้วย trigger `audit_row_change` /"
    " ไม่ลบข้อมูลจริง ใช้ `is_active = false` / ข้อมูลที่มีกติกาซับซ้อนเขียนผ่านฟังก์ชัน security definer เท่านั้น"
    " / เลขประจำตัวประชาชนเก็บแบบเข้ารหัส (`national_id_enc`) และแฮช (`national_id_hash`) ด้วยกุญแจ Vault `national_id_key`",
    "",
    "## สารบัญ",
    "",
]
groups = [(title, [t for t in names if t in by_name]) for title, names in GROUPS]
others = sorted(set(by_name) - {t for _, names in groups for t in names})
if others:
    groups.append(("อื่น ๆ", others))
for title, names in groups:
    out.append(f"- {title}: " + ", ".join(f"`{n}`" for n in names))
out.append("")
for title, names in groups:
    out += [f"## {title}", ""]
    for n in names:
        r = by_name[n]
        out += [f"### `{n}`", ""]
        if r["comment"]:
            out += [r["comment"], ""]
        out += ["| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |", "|---|---|---|---|"]
        for c in r["cols"] or []:
            out.append(f"| `{c['name']}` | {c['type']} | {'ได้' if c['null'] else ''} | {c['comment'].replace('|', '/')} |")
        out.append("")
        if r["fks"]:
            out.append("ความสัมพันธ์: " + "; ".join(f"`{f['col']}` → `{f['ref']}`" for f in r["fks"]))
        out.append(f"RLS: {'เปิด' if r['rls'] else 'ปิด'} · policy: " + (", ".join(r["policies"]) if r["policies"] else "ไม่มี (เขียนผ่านฟังก์ชันเท่านั้น)"))
        if r["triggers"]:
            out.append("trigger: " + ", ".join(r["triggers"]))
        out.append("")
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print(f"เขียน {OUT}: {len(rows)} ตาราง")
