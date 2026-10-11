#!/usr/bin/env python3
"""ตรวจ RLS ทุกตารางแบบทดลองจริง (บทที่ 31)

ใช้กับฐานข้อมูลทดสอบในเครื่องเท่านั้น (ห้ามรันกับฐานจริง: สร้างข้อมูลทดสอบด้วย session_replication_role = replica)
1) สร้างแถวทดสอบของทุกตารางใน 3 เขต: A = ตำบลในเขตของผู้ทดสอบ, B = ต่างจังหวัด, C = ต่างนิกาย
2) สร้างผู้ใช้จำลองหนึ่งคนต่อหนึ่งบทบาท (บทบาทที่ต้องมีเขต = อำเภอ ก1 มหานิกาย ซึ่งครอบคลุม A)
3) ในนามผู้ใช้แต่ละคน ลอง อ่าน / เพิ่ม / แก้ / ลบ แถวของแต่ละเขต (ทุกการเขียนย้อนกลับด้วย savepoint)
4) บันทึกผลเป็น JSON ให้ rls_report.py สร้างรายงาน Excel

ใช้: python3 -I scripts/security/rls_matrix.py <dbname> <out.json> [อีเมลบัญชีทดสอบ ...]
"""
import json
import re
import sys
import uuid

import psycopg2

DB = sys.argv[1] if len(sys.argv) > 1 else "app3"
OUT = sys.argv[2] if len(sys.argv) > 2 else "rls_matrix.json"
REAL_USERS = sys.argv[3:]

BRANCH_UNITS = {"A": "TEST-M-R1-P1-D1-S1", "B": "TEST-M-R1-P2-D1-S1", "C": "TEST-D-R1-P1-D1-S1"}
SIBLING_UNITS = {"A": "TEST-M-R1-P1-D1-S2", "B": "TEST-M-R1-P2-D1-S2", "C": "TEST-D-R1-P1-D1-S2"}
SKIP = object()
ROLE_UNIT = "TEST-M-R1-P1-D1"
CENTRAL_UNIT = "TEST-C"
USER_TABLES = {"profiles"}

conn = psycopg2.connect(host="/tmp/pg", port=5433, user="postgres", dbname=DB)
conn.autocommit = False
cur = conn.cursor()


def q(sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall() if cur.description else []


q("set statement_timeout = '10s'")
unit_id = {k: q("select id from org_units where code = %s", (v,))[0][0] for k, v in BRANCH_UNITS.items()}
sibling_id = {k: q("select id from org_units where code = %s", (v,))[0][0] for k, v in SIBLING_UNITS.items()}
enums = {}
for typ, label in q("select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid order by t.typname, e.enumsortorder"):
    enums.setdefault(typ, []).append(label)
role_unit = q("select id from org_units where code = %s", (ROLE_UNIT,))[0][0]
central_unit = q("select id from org_units where code = %s", (CENTRAL_UNIT,))[0][0]

tables = [r[0] for r in q("""select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1""")]
rls = dict(q("""select c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'"""))
cols = {}
for t, c, dt, udt, nullable, default, ident, gen in q("""
  select table_name, column_name, data_type, udt_name, is_nullable = 'YES', column_default, is_identity = 'YES', is_generated <> 'NEVER'
  from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position"""):
    cols.setdefault(t, []).append(dict(name=c, type=dt, udt=udt, nullable=nullable, default=default, identity=ident, generated=gen))
pk = {}
for t, c in q("""select tc.table_name, kcu.column_name from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY' order by kcu.ordinal_position"""):
    pk.setdefault(t, []).append(c)
fks = {}
for t, col, ref_schema, ref_t, ref_col in q("""
  select c.conrelid::regclass::text, a.attname, rn.nspname, rc.relname, ra.attname
  from pg_constraint c
  join pg_class rc on rc.oid = c.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1"""):
    fks.setdefault(t.replace("public.", ""), {})[col] = (ref_schema, ref_t, ref_col)
checks = {}
for t, d in q("""select conrelid::regclass::text, pg_get_constraintdef(oid) from pg_constraint
  where contype = 'c' and connamespace = 'public'::regnamespace"""):
    checks.setdefault(t.replace("public.", ""), []).append(d)
policies = {}
for t, name, cmd, roles, qual, wc in q("""select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public'"""):
    policies.setdefault(t, []).append(dict(name=name, cmd=cmd, roles=roles, using=qual, check=wc))
grants = {}
for t, g, p in q("""select table_name, grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')"""):
    grants.setdefault(t, {}).setdefault(g, []).append(p)


# ---------------------------------------------------------------
# ลำดับตาราง (แม่ก่อนลูก) และการจัดชนิด: scoped = ผูกเขตหรือผู้ใช้ (ตรงหรือผ่านแม่)
# ---------------------------------------------------------------
def parents(t):
    return {ref_t for (s, ref_t, _) in fks.get(t, {}).values() if s == "public" and ref_t != t}


order, seen = [], set()


def visit(t, stack=()):
    if t in seen or t in stack:
        return
    for p in sorted(parents(t)):
        if p in tables:
            visit(p, stack + (t,))
    seen.add(t)
    order.append(t)


for t in tables:
    visit(t)

scoped = set()
changed = True
while changed:
    changed = False
    for t in tables:
        if t in scoped or t in ("org_units", "profiles"):
            continue
        refs = fks.get(t, {}).values()
        if any(r[1] in ("org_units", "profiles", "users") or r[1] in scoped for r in refs):
            scoped.add(t)
            changed = True

# ---------------------------------------------------------------
# ผู้ใช้เจ้าของข้อมูลในแต่ละเขต และผู้ใช้จำลองต่อบทบาท
# ---------------------------------------------------------------
q("set session_replication_role = replica")


def make_user(email, first):
    uid = str(uuid.uuid4())
    q("insert into auth.users (id, email, aud, role) values (%s, %s, 'authenticated', 'authenticated')", (uid, email))
    q("""insert into profiles (id, first_name, email, status) values (%s, %s, %s, 'active')""", (uid, first, email))
    return uid


owner = {b: make_user(f"owner.{b.lower()}@rls.test", f"เจ้าของ{b}") for b in BRANCH_UNITS}
role_rows = q("select key, requires_org_unit, mfa_required from roles order by sort_order")
role_users = {}
for key, needs_unit, _mfa in role_rows:
    uid = make_user(f"role.{key}@rls.test", f"บทบาท {key}")
    unit = role_unit if needs_unit else (central_unit if key in ("central_staff",) else None)
    q("insert into user_roles (user_id, role_key, org_unit_id) values (%s, %s, %s)", (uid, key, unit))
    role_users[key] = uid

# ---------------------------------------------------------------
# สร้างค่าของแถวทดสอบ
# ---------------------------------------------------------------
fixture = {}  # table -> branch -> [pk values]
extra = {}  # table -> branch -> pk ของแถวที่สอง (ใช้กับตารางที่ต้องอ้างแถวคู่ในเขตเดียวกัน)


def fx(t, b):
    d = fixture.get(t, {})
    v = d.get(b) or d.get("G")
    return v[0] if v else None


# ค่าที่ต้องกำหนดเองเพื่อให้ผ่าน check constraint (SKIP = ไม่ใส่ค่า)
OVERRIDES = {
    "fiscal_years": lambda b: {"year_be": 2590, "starts_on": "2046-10-01", "ends_on": "2047-09-30"},
    "asset_transfers": lambda b: {"to_unit_id": sibling_id[b]},
    "attachments": lambda b: {"entity_table": "places", "entity_id": str(fx("places", b)), "storage_path": f"{owner[b]}/rls.pdf", "size_bytes": 100, "doc_type_id": SKIP},
    "contact_messages": lambda b: {"sender_email": "rls@example.com"},
    "contact_topic_recipients": lambda b: {"role_key": "secretary", "user_id": SKIP},
    "documents": lambda b: {"direction": "send", "status": "draft", "kind": "external", "series": SKIP, "seq_no": SKIP, "number_year": SKIP},
    "downloads": lambda b: {"url": "https://example.com/rls.pdf", "storage_path": SKIP, "file_name": SKIP, "size_bytes": SKIP},
    "exam_pass_history": lambda b: {"birth_date": "1990-01-01"},
    "quiz_attempts": lambda b: {"kind": "full", "unit_id": SKIP, "device_id": SKIP, "question_ids": "{%s}" % (fx("questions", "G") or uuid.uuid4())},
    "warehouses": lambda b: {"kind": "main", "parent_id": SKIP},
    "stock_moves": lambda b: {"kind": "adjust", "receipt_id": SKIP, "requisition_id": SKIP, "transfer_id": SKIP, "quantity": 1},
    "stock_transfers": lambda b: {"to_warehouse_id": (extra.get("warehouses", {}).get(b) or fx("warehouses", b))},
    "budget_items": lambda b: {"name": f"rls-{uuid.uuid4().hex[:8]}", "kind": "program", "parent_id": SKIP, "category_id": SKIP, "source_id": SKIP, "amount": SKIP},
    "budget_allocations": lambda b: {"to_unit_id": sibling_id[b], "to_place_id": SKIP},
    "budget_transfers": lambda b: {"to_item_id": extra.get("budget_items", {}).get(b)},
    "budget_use_requests": lambda b: {"carried_from_id": SKIP},
    "budget_disbursements": lambda b: {"kind": "payment", "amount": 1, "payee": "rls", "adjusts_id": SKIP},
    "document_deliveries": lambda b: {"status": "pending", "received_document_id": SKIP},
    "document_routes": lambda b: {"action": "forward", "status": "pending", "received_document_id": SKIP, "to_user_id": SKIP},
    "announcement_files": lambda b: {"storage_path": f"announcements/{fx('announcements', b)}/{uuid.uuid4()}.pdf"},
    "places": lambda b: {"place_type": "temple", "parent_place_id": SKIP, "sect": "dhammayut" if b == "C" else "mahanikaya", "subdistrict_code": SKIP},
    "assets": lambda b: {"condition": "usable"},
    "exam_venues": lambda b: {"levels": "{tri}", "moved_to_venue_id": SKIP},
}
EXTRA_TABLES = {"warehouses", "budget_items"}
fixture_err = {}
seq = [0]


def literal_choices(t, col):
    out = []
    for d in checks.get(t, []):
        m = re.search(r"\b%s\b = ANY \(+ARRAY\[([^\]]*)\]" % re.escape(col), d)
        if m:
            out += re.findall(r"'([^']*)'", m.group(1))
        m = re.search(r"\b%s\b = '([^']*)'" % re.escape(col), d)
        if m:
            out.append(m.group(1))
    return out


def existing_pk(ref_schema, ref_t, ref_col):
    r = q(f'select "{ref_col}" from "{ref_schema}"."{ref_t}" limit 1')
    return r[0][0] if r else None


def value_for(t, c, branch, for_user_insert=False):
    name = c["name"]
    ov = OVERRIDES[t](branch) if t in OVERRIDES else {}
    if name in ov:
        return None if ov[name] is SKIP else ov[name]
    fk = fks.get(t, {}).get(name)
    if fk:
        s, rt, rc = fk
        if rt == "org_units":
            return unit_id[branch] if branch in unit_id else central_unit
        if rt in ("profiles", "users"):
            return owner.get(branch) or owner["A"]
        if rt in fixture and fixture[rt].get(branch if branch in fixture[rt] else "G"):
            return (fixture[rt].get(branch) or fixture[rt].get("G"))[0]
        if rt in fixture and fixture[rt]:
            return next(iter(fixture[rt].values()))[0]
        return existing_pk(s, rt, rc)
    if c["identity"] or c["generated"]:
        return None
    if c["default"] is not None and name not in pk.get(t, []):
        return None
    if c["nullable"] and name not in pk.get(t, []):
        return None
    seq[0] += 1
    lits = literal_choices(t, name)
    udt = c["udt"]
    if udt == "uuid":
        return str(uuid.uuid4())
    if udt in enums:
        return enums[udt][-1]
    if lits:
        return lits[0]
    if udt in ("text", "varchar", "bpchar"):
        return f"rls-{branch.lower()}-{seq[0]}"
    if udt in ("int2", "int4", "int8", "numeric", "float8"):
        for d in checks.get(t, []):
            m = re.search(r"\b%s\b >= \(?(\d+)" % re.escape(name), d)
            if m:
                return int(m.group(1)) + seq[0] % 50
        return 1 + seq[0] % 50
    if udt == "bool":
        return False
    if udt == "date":
        return "2026-10-01"
    if udt in ("timestamptz", "timestamp"):
        return "2026-10-01T00:00:00+07:00"
    if udt in ("jsonb", "json"):
        return "{}"
    if udt.startswith("_"):
        return "{}"
    return None


def build_row(t, branch):
    row = {}
    ov = OVERRIDES[t](branch) if t in OVERRIDES else {}
    for k, v in ov.items():
        if v is not SKIP and not any(c["name"] == k for c in cols[t]):
            raise KeyError(f"{t}.{k}")
    for c in cols[t]:
        v = value_for(t, c, branch)
        if v is not None:
            row[c["name"]] = v
    return row


def insert_sql(t, row):
    names = list(row)
    keys = pk.get(t, [])
    ret = f' returning "{keys[0]}"' if len(keys) == 1 else ""
    return (f'insert into public."{t}" (' + ", ".join(f'"{n}"' for n in names) + ") values (" + ", ".join(["%s"] * len(names)) + ")" + ret, [row[n] for n in names])


fixture["profiles"] = {b: [u] for b, u in owner.items()}
for t in order:
    if not rls.get(t) or t == "profiles":
        continue
    branches = list(BRANCH_UNITS) if t in scoped else ["G"]
    fixture[t] = {}
    for b in branches:
        row = build_row(t, b)
        sql, args = insert_sql(t, row)
        q("savepoint fx")
        try:
            r = q(sql, args)
            fixture[t][b] = [r[0][0]] if r else []
            if t in EXTRA_TABLES:
                sql2, args2 = insert_sql(t, build_row(t, b))
                extra.setdefault(t, {})[b] = q(sql2, args2)[0][0]
            q("release savepoint fx")
        except Exception as e:  # noqa: BLE001
            q("rollback to savepoint fx")
            fixture_err.setdefault(t, {})[b] = str(e).splitlines()[0][:200]
    if not fixture[t] and len(pk.get(t, [])) == 1:
        r = q(f'select "{pk[t][0]}" from public."{t}" limit 1')
        if r:
            fixture[t]["G"] = [r[0][0]]
q("set session_replication_role = origin")
conn.commit()

# ---------------------------------------------------------------
# ทดลองในนามผู้ใช้
# ---------------------------------------------------------------


def classify(e):
    m = str(e)
    if "row-level security" in m:
        return "rls"
    if "permission denied" in m:
        return "denied"
    return "rule: " + m.splitlines()[0][:160]


def as_user(uid, aal="aal2"):
    q("reset role")
    q("select set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": uid, "role": "authenticated", "aal": aal}),))
    q("set role authenticated")


def probe(uid):
    res = {}
    as_user(uid)
    for t in order:
        if t not in fixture or len(pk.get(t, [])) != 1:
            continue
        key = pk[t][0]
        key_type = next(c["udt"] for c in cols[t] if c["name"] == key)
        r = {"read": {}, "update": {}, "delete": {}, "insert": {}}
        upd_col = next((c["name"] for c in cols[t] if c["name"] == "updated_at"), None) or next(
            (c["name"] for c in cols[t] if c["name"] != key and not c["identity"] and not c["generated"]), key)
        for b, ids in fixture[t].items():
            if not ids:
                continue
            for op, sql in (
                ("read", f'select count(*) from public."{t}" where "{key}" = any(%s::{key_type}[])'),
                ("update", f'update public."{t}" set "{upd_col}" = "{upd_col}" where "{key}" = any(%s::{key_type}[])'),
                ("delete", f'delete from public."{t}" where "{key}" = any(%s::{key_type}[])'),
            ):
                q("savepoint p")
                try:
                    out = q(sql, ([str(i) if not isinstance(i, int) else i for i in ids],))
                    r[op][b] = out[0][0] if op == "read" else cur.rowcount
                except Exception as e:  # noqa: BLE001
                    r[op][b] = classify(e)
                q("rollback to savepoint p")
        for b in fixture[t]:
            q("reset role")
            q("savepoint g")
            row = build_row(t, b)
            q("rollback to savepoint g")
            as_user(uid)
            sql, args = insert_sql(t, row)
            q("savepoint p")
            try:
                q(sql, args)
                r["insert"][b] = "ok"
            except Exception as e:  # noqa: BLE001
                r["insert"][b] = classify(e)
            q("rollback to savepoint p")
        res[t] = r
    q("reset role")
    conn.rollback()
    return res


results = {"roles": {}, "accounts": {}}
for key, uid in role_users.items():
    results["roles"][key] = probe(uid)
for email in REAL_USERS:
    r = q("select id from auth.users where email = %s", (email,))
    if r:
        results["accounts"][email] = probe(str(r[0][0]))
conn.rollback()

# ตารางที่ข้อมูลผูกกับเขตปกครอง (ตรงหรือผ่านแม่ ไม่นับการผูกผ่านผู้บันทึก)
unit_scoped = set()
changed = True
while changed:
    changed = False
    for t in tables:
        if t in unit_scoped or t == "org_units":
            continue
        if any(r[1] == "org_units" or r[1] in unit_scoped for r in fks.get(t, {}).values()):
            unit_scoped.add(t)
            changed = True
comments = dict(q("""select c.relname, coalesce(obj_description(c.oid, 'pg_class'), '') from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'"""))

json.dump(
    dict(
        unit_scoped=sorted(unit_scoped),
        comments=comments,
        tables=order,
        rls=rls,
        scoped=sorted(scoped),
        fixture={t: {b: [str(i) for i in v] for b, v in d.items()} for t, d in fixture.items()},
        fixture_errors=fixture_err,
        policies=policies,
        grants=grants,
        role_names=dict(q("select key, name from roles")),
        role_order=[r[0] for r in role_rows],
        results=results,
    ),
    open(OUT, "w"),
    ensure_ascii=False,
    indent=1,
    default=str,
)
print("tables", len(order), "fixture", sum(1 for t in fixture if fixture[t]), "fixture_errors", len(fixture_err))
