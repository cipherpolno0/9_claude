#!/usr/bin/env python3
"""ตรวจหน้าสาธารณะและ API ว่าไม่ส่งข้อมูลส่วนบุคคลออกไป แม้ในข้อมูลดิบ (บทที่ 31)

ใช้กับฐานข้อมูลทดสอบในเครื่องเท่านั้น:
1) ฝังข้อมูลที่ "ห้ามเผยแพร่" ลงในบุคคล ผู้ดำรงตำแหน่ง ประธานสนามสอบ ผู้สมัคร ผลสอบ คำขอ (เลขประจำตัว 4 ตัวท้าย วันเกิด เบอร์ส่วนตัว
   ที่อยู่จัดส่ง นามสกุล หมายเหตุ เลขที่ ปกศ. ชื่อเจ้าสำนัก)
2) เรียกทุกฟังก์ชันที่บทบาท anon เรียกได้ และอ่านทุกตารางผ่าน REST ด้วยกุญแจสาธารณะ
3) เปิดทุกหน้าสาธารณะ (HTML และข้อมูล RSC ที่เบราว์เซอร์ได้รับ) และไฟล์ส่งออก Excel แล้วค้นหาข้อความที่ห้ามเผยแพร่
ใช้: python3 -I scripts/security/public_pii_check.py <dbname> <base_url> <rest_url> <publishable_key> <out.json>
"""
import io
import json
import re
import sys
import urllib.error
import urllib.request
import uuid
import zipfile

import psycopg2

DB, BASE, REST, KEY, OUT = sys.argv[1:6]
conn = psycopg2.connect(host="/tmp/pg", port=5433, user="postgres", dbname=DB)
conn.autocommit = True
cur = conn.cursor()


def q(sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall() if cur.description else []


def one(sql, args=None):
    r = q(sql, args)
    return r[0][0] if r else None


SECRET = {
    "เลขประจำตัว 4 ตัวท้าย (บุคคล)": "9876",
    "เลขประจำตัว 4 ตัวท้าย (ผู้สมัคร)": "7788",
    "วันเกิด ค.ศ.": "1975-03-14",
    "วันเกิด พ.ศ.": "2518-03-14",
    "วันเกิดภาษาไทย": "14 มี.ค. 2518",
    "วันเกิดภาษาไทยเต็ม": "14 มีนาคม 2518",
    "วันเกิดผู้สมัคร": "1990-07-07",
    "วันเกิดผู้สมัครภาษาไทย": "7 ก.ค. 2533",
    "เบอร์ส่วนตัวบุคคล": "0899999123",
    "เบอร์ประธานสนาม (ไม่ยินยอม)": "0811111222",
    "ที่อยู่จัดส่งข้อสอบ": "ที่อยู่จัดส่งลับ",
    "นามสกุลบุคคลในทำเนียบ": "นามสกุลลับ",
    "หมายเหตุบุคคล": "หมายเหตุลับ",
    "เลขที่ ปกศ.": "ปกศลับ",
    "ชื่อเจ้าสำนักในคำขอ": "เจ้าสำนักลับ",
    "เหตุผลของคำขอ": "เหตุผลลับ",
    "อีเมลผู้ยื่น": "requester.secret@example.com",
}

S1 = one("select id from org_units where code = 'TEST-M-R1-P1-D1-S1'")
YEAR = one("select id from academic_years where is_current")
YEAR_BE = one("select year_be from academic_years where is_current")
TPL = one("select id from form_templates where is_active and exam_type = 'nak_tham' and level = 'tri'")
ids = {k: str(uuid.uuid4()) for k in ("person", "person2", "temple", "samnak", "venue", "officer", "round", "batch", "cand", "req", "user")}

q("set session_replication_role = replica")
q("insert into auth.users (id, email, aud, role) values (%s, %s, 'authenticated', 'authenticated')", (ids["user"], SECRET["อีเมลผู้ยื่น"]))
q("insert into profiles (id, first_name, email, phone, status) values (%s, 'ผู้ยื่นทดสอบ', %s, %s, 'active')", (ids["user"], SECRET["อีเมลผู้ยื่น"], SECRET["เบอร์ส่วนตัวบุคคล"]))
q("""insert into persons (id, person_type, title, first_name, monastic_name, last_name, birth_date, national_id_enc, national_id_hash, national_id_last4,
       phone, note, temple_name, org_unit_id, status)
     values (%s, 'monastic', 'พระครู', 'ทดสอบสาธารณะ', 'ฉายาทดสอบ', %s, '1975-03-14', '\\x00'::bytea, repeat('a', 64), %s, %s, %s, 'วัดทดสอบสาธารณะ', %s, 'active')""",
  (ids["person"], SECRET["นามสกุลบุคคลในทำเนียบ"], SECRET["เลขประจำตัว 4 ตัวท้าย (บุคคล)"], SECRET["เบอร์ส่วนตัวบุคคล"], SECRET["หมายเหตุบุคคล"], S1))
q("""insert into appointments (person_id, position_type_key, org_unit_id, appointed_on, end_note) values (%s, 'chief_subdistrict', %s, '2020-01-01', %s)""",
  (ids["person"], S1, SECRET["หมายเหตุบุคคล"]))
q("""insert into places (id, place_type, code, name, sect, org_unit_id, status, office_phone, responsible_person_id, note, subdistrict_code,
       district_code, province_code, email)
     values (%s, 'temple', 'PII-T', 'วัดทดสอบสาธารณะ', 'mahanikaya', %s, 'open', '021234567', %s, %s, 120101, 1201, 12, %s)""",
  (ids["temple"], S1, ids["person"], SECRET["หมายเหตุบุคคล"], SECRET["อีเมลผู้ยื่น"]))
q("""insert into places (id, place_type, code, name, sect, org_unit_id, status, parent_place_id, responsible_person_id, subdistrict_code, district_code, province_code)
     values (%s, 'samnak_rian', 'PII-S', 'สำนักเรียนทดสอบสาธารณะ', 'mahanikaya', %s, 'open', %s, %s, 120101, 1201, 12)""",
  (ids["samnak"], S1, ids["temple"], ids["person"]))
q("""insert into exam_venues (id, code, name, venue_type, place_id, org_unit_id, levels, status) values (%s, '9911', 'สนามสอบทดสอบสาธารณะ', 'nak_tham', %s, %s, '{tri,tho,ek}', 'open')""",
  (ids["venue"], ids["temple"], S1))
q("""insert into venue_officers (id, venue_id, academic_year_id, role, person_id, delivery_address, contact_phone, is_public, is_phone_public, note)
     values (%s, %s, %s, 'chair', %s, %s, %s, true, false, %s)""",
  (ids["officer"], ids["venue"], YEAR, ids["person"], SECRET["ที่อยู่จัดส่งข้อสอบ"], SECRET["เบอร์ประธานสนาม (ไม่ยินยอม)"], SECRET["หมายเหตุบุคคล"]))
q("""insert into exam_rounds (id, academic_year_id, exam_type, level, opens_on, closes_on, exam_starts_on, status, result_status, results_announced_on)
     values (%s, %s, 'nak_tham', 'tri', current_date - 30, current_date - 10, current_date - 5, 'closed', 'published', current_date - 1)""", (ids["round"], YEAR))
q("""insert into registration_batches (id, round_id, template_id, place_id, venue_id, org_unit_id, uploaded_by, status, file_name)
     values (%s, %s, %s, %s, %s, %s, %s, 'certified', 'ลับ.xlsx')""", (ids["batch"], ids["round"], TPL, ids["samnak"], ids["venue"], S1, ids["user"]))
q("""insert into candidates (id, batch_id, round_id, row_no, seq, candidate_code, person_kind, person_key, title, first_name, monastic_name, last_name,
       birth_date, national_id_enc, national_id_hash, national_id_last4, school_name, level, status, counted, extra)
     values (%s, %s, %s, 1, 1, %s, 'monastic', 'pii-key', 'สามเณร', 'ผู้สมัครสาธารณะ', 'ฉายาผู้สมัคร', 'นามสกุลผู้สมัคร', '1990-07-07', '\\x00'::bytea, repeat('b', 64), %s,
       'สำนักเรียนทดสอบสาธารณะ', 'tri', 'ok', true, %s)""",
  (ids["cand"], ids["batch"], ids["round"], f"{YEAR_BE}-ศ1-999999", SECRET["เลขประจำตัว 4 ตัวท้าย (ผู้สมัคร)"],
   json.dumps({"phone": SECRET["เบอร์ส่วนตัวบุคคล"], "address": SECRET["ที่อยู่จัดส่งข้อสอบ"]})))
q("""insert into exam_results (candidate_id, round_id, result, certificate_no, note) values (%s, %s, 'passed', %s, %s)""",
  (ids["cand"], ids["round"], SECRET["เลขที่ ปกศ."], SECRET["หมายเหตุบุคคล"]))
q("""insert into requests (id, type_key, request_no, requester_id, org_unit_id, title, status, payload, submitted_at)
     values (%s, 'samnak_establish', 'ESTAB-2569-0999', %s, %s, 'ขอจัดตั้งสำนักทดสอบสาธารณะ', 'pending', %s, now())""",
  (ids["req"], ids["user"], S1, json.dumps({"name": "สำนักทดสอบสาธารณะ", "place_type": "samnak_rian", "temple_id": ids["temple"],
   "temple_name": "วัดทดสอบสาธารณะ", "head_person_id": ids["person"], "head_name": SECRET["ชื่อเจ้าสำนักในคำขอ"], "detail": SECRET["เหตุผลของคำขอ"]})))
q("""insert into request_steps (request_id, step_no, org_unit_id, level, status, comment, pending_since)
     values (%s, 1, %s, 'subdistrict', 'pending', %s, now())""", (ids["req"], S1, SECRET["เหตุผลของคำขอ"]))
q("update requests set current_step = 1 where id = %s", (ids["req"],))
q("set session_replication_role = origin")

findings = []


def scan(where, text):
    for label, value in SECRET.items():
        # ตัวเลขล้วนต้องไม่ติดกับตัวเลขอื่น (กันการเจอซ้ำในเวลาหรือรหัสอื่น)
        pat = r"(?<!\d)" + re.escape(value) + r"(?!\d)" if value.isdigit() else re.escape(value)
        m = re.search(pat, text)
        if m:
            i = m.start()
            findings.append({"where": where, "secret": label, "context": text[max(0, i - 60): i + 60]})


# ---------------------------------------------------------------
# 1) ทุกฟังก์ชันที่ anon เรียกได้
# ---------------------------------------------------------------
ARGS = {
    "p_id": None, "p_q": None, "p_type": None, "p_region": None, "p_province": None, "p_district": None, "p_subdistrict": None,
    "p_sect": None, "p_status": None, "p_limit": 100, "p_offset": 0, "p_level": None, "p_year": YEAR_BE, "p_request_no": "ESTAB-2569-0999",
    "p_venue_id": ids["venue"], "p_place": ids["samnak"], "p_device": str(uuid.uuid4()), "p_org_unit_id": S1, "p_date": "2026-10-01",
    "p_scope": "all",
}
SPECIAL = {
    "public_place": [{"p_id": ids["temple"]}, {"p_id": ids["samnak"]}],
    "public_place_related": [{"p_id": ids["temple"]}],
    "public_venue": [{"p_id": ids["venue"]}],
    "public_places": [{**ARGS, "p_type": t} for t in ("temple", "samnak_rian")] + [{**ARGS, "p_type": "temple", "p_q": "ทดสอบ"}],
    "public_venues": [ARGS, {**ARGS, "p_q": "ทดสอบ"}],
    "public_officers": [ARGS, {**ARGS, "p_q": "ทดสอบสาธารณะ"}],
    "public_result_list": [{"p_year": YEAR_BE, "p_type": "nak_tham", "p_level": "tri", "p_place": ids["samnak"]}],
    "public_result_places": [{"p_year": YEAR_BE, "p_type": "nak_tham", "p_level": "tri"}],
    "public_requests": [{**ARGS, "p_type": None, "p_year": 2569}],
    "public_request_summary": [{"p_year": 2569}],
}
called = []
fns = q("""select p.proname, pg_get_function_identity_arguments(p.oid), array(select unnest(p.proargnames)) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.prorettype <> 'trigger'::regtype
    and p.proname not in ('quiz_save_answer', 'quiz_start', 'quiz_submit') order by 1""")
q("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', false)")
for name, sig, argnames in fns:
    variants = SPECIAL.get(name) or [{a: ARGS.get(a) for a in (argnames or []) if a.startswith("p_")}]
    for args in variants:
        names = [a for a in (argnames or []) if a.startswith("p_")]
        sql = f"select to_jsonb(t) from public.{name}(" + ", ".join(f"{a} => %s" for a in names) + ") t"
        try:
            q("set role anon")
            rows = q(sql, [args.get(a) for a in names])
            text = json.dumps([r[0] for r in rows], ensure_ascii=False)
            called.append({"fn": name, "args": {k: v for k, v in args.items() if v is not None}, "bytes": len(text)})
            scan(f"rpc {name} {json.dumps({k: v for k, v in args.items() if v is not None}, ensure_ascii=False)}", text)
        except Exception as e:  # noqa: BLE001
            called.append({"fn": name, "error": str(e).splitlines()[0][:200]})
        finally:
            q("reset role")

# ---------------------------------------------------------------
# 2) ทุกตารางผ่าน REST ด้วยกุญแจสาธารณะ (anon)
# ---------------------------------------------------------------
tables = [r[0] for r in q("select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1")]
rest = []
for t in tables:
    req = urllib.request.Request(f"{REST}/{t}?select=*&limit=50", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", "replace")
            rows = json.loads(body) if body.startswith("[") else []
            rest.append({"table": t, "status": r.status, "rows": len(rows)})
            scan(f"rest {t}", body)
    except urllib.error.HTTPError as e:
        rest.append({"table": t, "status": e.code, "rows": 0})

# ---------------------------------------------------------------
# 3) หน้าสาธารณะ (HTML + RSC) และไฟล์ส่งออก
# ---------------------------------------------------------------
PAGES = [
    "/", "/registry", "/registry/temples", "/registry/samnak-rian", "/registry/venues", "/registry/temples?q=%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A",
    f"/registry/temples/{ids['temple']}", f"/registry/samnak-rian/{ids['samnak']}", f"/registry/venues/{ids['venue']}",
    "/directory/officers", "/directory/officers?q=%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A", "/exams", "/exams/stats", "/exams/result-stats",
    "/exams/check", "/exams/results", "/track", "/track/ESTAB-2569-0999", "/track/search?year=2569", "/news", "/downloads", "/downloads/guide",
    "/contact", "/privacy", "/quiz", "/login", "/request-account",
]
EXPORTS = ["/registry/temples/export", "/registry/samnak-rian/export", "/registry/venues/export"]
pages = []
for path in PAGES:
    for rsc in (False, True):
        headers = {"RSC": "1"} if rsc else {}
        req = urllib.request.Request(BASE + path, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8", "replace")
                pages.append({"path": path, "rsc": rsc, "status": r.status, "bytes": len(body)})
                scan(f"page {path}{' (RSC)' if rsc else ''}", body)
        except urllib.error.HTTPError as e:
            pages.append({"path": path, "rsc": rsc, "status": e.code})
for path in EXPORTS:
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            data = r.read()
            z = zipfile.ZipFile(io.BytesIO(data))
            text = "".join(z.read(n).decode("utf-8", "replace") for n in z.namelist() if n.endswith(".xml"))
            pages.append({"path": path, "status": r.status, "bytes": len(data)})
            scan(f"export {path}", text)
    except urllib.error.HTTPError as e:
        pages.append({"path": path, "status": e.code})

# ตรวจว่าข้อมูลที่เผยแพร่ได้ยังแสดงจริง (กันกรณีหน้าว่างทั้งหมดแล้วผ่านเพราะไม่มีข้อมูล)
visible = {}
for path, needle in [
    (f"/registry/venues/{ids['venue']}", "สนามสอบทดสอบสาธารณะ"),
    (f"/registry/temples/{ids['temple']}", "021234567"),
    ("/directory/officers?q=%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A", "ทดสอบสาธารณะ"),
    ("/track/ESTAB-2569-0999", "สำนักทดสอบสาธารณะ"),
]:
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            visible[path] = needle in r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        visible[path] = f"HTTP {e.code}"

json.dump({"findings": findings, "functions": called, "rest": rest, "pages": pages, "visible": visible}, open(OUT, "w"), ensure_ascii=False, indent=1)
print("bad pages", [(p["path"], p.get("rsc"), p["status"]) for p in pages if p["status"] not in (200,)])
print("fn errors", [(c["fn"], c["error"][:120]) for c in called if "error" in c])
print("findings", len(findings), "functions", len(called), "rest_readable", [x["table"] for x in rest if x.get("rows")], "visible", visible)
for f in findings[:30]:
    print(" ", f["where"], "|", f["secret"], "|", re.sub(r"\s+", " ", f["context"]))
