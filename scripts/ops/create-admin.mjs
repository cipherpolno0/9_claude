// สร้างหรือกำหนดผู้ดูแลระบบคนแรกของชุดใช้งานจริง (บทที่ 32)
// ใช้หลังล้างข้อมูลทดสอบ (ซึ่งลบบัญชีทดสอบทั้งหมด) เพื่อให้มีผู้เข้าไปนำเข้าข้อมูลจริงได้
//
// วิธีรัน (ในโฟลเดอร์โครงการ):
//   node --env-file=.env.production.local scripts/ops/create-admin.mjs อีเมล "ชื่อ" ["นามสกุล"] [--site=https://ชื่อเว็บ]
// ไฟล์ .env.production.local ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ของชุดใช้งานจริง (ห้าม commit)
//
// ผลลัพธ์: บัญชีที่มีบทบาท ผู้ดูแลระบบ และลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว หมดอายุตามค่าตั้งของ Supabase ปกติ 1 ชั่วโมง)
// ลิงก์แสดงบนจอนี้เท่านั้น ส่งให้เจ้าของบัญชีด้วยช่องทางส่วนตัว ห้ามโพสต์ในกลุ่ม
// เข้าสู่ระบบครั้งแรกต้องตั้งยืนยันตัวตน 2 ขั้น (แอปยืนยันตัวตนบนมือถือ) เพราะผู้ดูแลระบบบังคับเสมอ

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const site = (args.find((a) => a.startsWith("--site="))?.slice(7) ?? "http://localhost:3002").replace(/\/$/, "");
const [emailArg, firstName, lastName = ""] = args.filter((a) => !a.startsWith("--"));
const email = String(emailArg ?? "").trim().toLowerCase();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !firstName) {
  console.error('วิธีใช้: node --env-file=.env.production.local scripts/ops/create-admin.mjs อีเมล "ชื่อ" ["นามสกุล"] --site=https://ชื่อเว็บ');
  process.exit(1);
}
if (email.endsWith("@example.com")) {
  console.error("ห้ามใช้อีเมล @example.com (สงวนไว้สำหรับบัญชีทดสอบ)");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SECRET_KEY ในไฟล์ env ที่ระบุ");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

function fail(step, error) {
  console.error(`ผิดพลาดที่ขั้น "${step}":`, error?.message ?? error);
  process.exit(1);
}

console.log(`ฐานข้อมูล: ${new URL(url).hostname.split(".")[0]}`);

const { data: existing, error: findError } = await supabase.from("profiles").select("id, status").eq("email", email).maybeSingle();
if (findError) fail("ค้นบัญชีเดิม", findError);

let userId = existing?.id;
if (!userId) {
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error) fail("สร้างบัญชี", error);
  userId = data.user.id;
  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    first_name: firstName,
    last_name: lastName,
    email,
    status: "active",
    activated_at: now,
  });
  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    fail("บันทึกข้อมูลผู้ใช้", profileError);
  }
  console.log(`สร้างบัญชี ${email} แล้ว`);
} else if (existing.status !== "active") {
  const { error } = await supabase.from("profiles").update({ status: "active", status_reason: null }).eq("id", userId);
  if (error) fail("เปิดใช้บัญชี", error);
}

const { data: roles, error: rolesError } = await supabase
  .from("user_roles")
  .select("id")
  .eq("user_id", userId)
  .eq("role_key", "admin")
  .is("ends_on", null);
if (rolesError) fail("อ่านบทบาท", rolesError);
if (!roles?.length) {
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_key: "admin" });
  if (error) fail("ให้บทบาทผู้ดูแลระบบ", error);
  console.log("ให้บทบาท ผู้ดูแลระบบ แล้ว");
} else {
  console.log("บัญชีนี้มีบทบาท ผู้ดูแลระบบ อยู่แล้ว");
}

const { data: link, error: linkError } = await supabase.auth.admin.generateLink({ type: "recovery", email });
if (linkError) fail("สร้างลิงก์ตั้งรหัสผ่าน", linkError);
const setupUrl = `${site}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=/account/password`;
console.log("\nลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว ส่งให้เจ้าของบัญชีทางช่องทางส่วนตัว):");
console.log(setupUrl);
