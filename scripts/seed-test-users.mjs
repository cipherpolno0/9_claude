// สร้างบัญชีทดสอบ 8 บัญชี  *** ใช้กับข้อมูลทดสอบเท่านั้น ***
// วิธีรัน: npm run seed:test-users   (ต้องมีไฟล์ .env.local ที่เติม SUPABASE_SECRET_KEY แล้ว
// และรันข้อมูลทดสอบของบทที่ 2 ไว้แล้ว)
// รหัสผ่านจะถูกสุ่มใหม่ทุกครั้งที่รัน และแสดงบนจอนี้เท่านั้น

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SECRET_KEY ในไฟล์ .env.local");
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const ACCOUNTS = [
  { email: "test.secretary.tambon@example.com", first: "(ทดสอบ) เลขาฯ ตำบล", role: "secretary", unit: "TEST-M-R1-P1-D1-S1" },
  { email: "test.chief.amphoe@example.com", first: "(ทดสอบ) เจ้าคณะอำเภอ", role: "chief", unit: "TEST-M-R1-P1-D1" },
  { email: "test.secretary.changwat@example.com", first: "(ทดสอบ) เลขาฯ จังหวัด", role: "secretary", unit: "TEST-M-R1-P1" },
  { email: "test.jsp@example.com", first: "(ทดสอบ) จศป.", role: "education_staff", unit: "TEST-M-R1-P1-D1-S1" },
  { email: "test.finance@example.com", first: "(ทดสอบ) เจ้าหน้าที่การเงินอำเภอ", role: "finance_officer", unit: "TEST-M-R1-P1-D1" },
  { email: "test.quiz@example.com", first: "(ทดสอบ) ผู้จัดการคลังข้อสอบ", role: "quiz_manager", unit: null },
  { email: "test.central@example.com", first: "(ทดสอบ) เจ้าหน้าที่ส่วนกลาง", role: "central_staff", unit: null },
  { email: "test.admin@example.com", first: "(ทดสอบ) ผู้ดูแลระบบ", role: "admin", unit: null },
];

// รหัสผ่านสุ่ม: มีตัวอักษรและตัวเลขครบตามกติกา
const password = `Test-${randomBytes(9).toString("base64url")}-9a`;

function fail(step, error) {
  console.error(`ผิดพลาดที่ขั้น "${step}":`, error?.message ?? error);
  process.exit(1);
}

const { data: existing, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) fail("อ่านรายชื่อบัญชี", listError);

for (const account of ACCOUNTS) {
  let userId = existing.users.find((u) => u.email === account.email)?.id;

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) fail(`ตั้งรหัสผ่านใหม่ ${account.email}`, error);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
    });
    if (error) fail(`สร้างบัญชี ${account.email}`, error);
    userId = data.user.id;
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    first_name: account.first,
    email: account.email,
    status: "active",
    status_reason: null,
    activated_at: now,
    password_changed_at: now,
  });
  if (profileError) fail(`บันทึกข้อมูลผู้ใช้ ${account.email}`, profileError);

  let orgUnitId = null;
  if (account.unit) {
    const { data: unit, error } = await supabase.from("org_units").select("id").eq("code", account.unit).maybeSingle();
    if (error || !unit) fail(`หาเขตปกครอง ${account.unit} (ต้องรันข้อมูลทดสอบของบทที่ 2 ก่อน)`, error ?? "ไม่พบ");
    orgUnitId = unit.id;
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_key", account.role);
  if (rolesError) fail(`อ่านบทบาท ${account.email}`, rolesError);
  if (roles.length === 0) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role_key: account.role, org_unit_id: orgUnitId });
    if (error) fail(`กำหนดบทบาท ${account.email}`, error);
  }
}

console.log(`\nสร้างบัญชีทดสอบแล้ว ${ACCOUNTS.length} บัญชี (ทุกบัญชีใช้รหัสผ่านเดียวกัน)\n`);
for (const a of ACCOUNTS) console.log(`  ${a.email.padEnd(40)} ${a.first}`);
console.log(`\n  รหัสผ่าน: ${password}\n`);
console.log("บัญชีเจ้าคณะอำเภอ เจ้าหน้าที่การเงิน และผู้ดูแลระบบ ต้องตั้งค่ายืนยันตัวตน 2 ขั้นเมื่อเข้าสู่ระบบครั้งแรก");
console.log("ก่อนใช้งานจริง ให้ระงับหรือลบบัญชีทดสอบเหล่านี้\n");
