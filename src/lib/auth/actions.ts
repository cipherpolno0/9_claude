"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/form";
import { explainError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { originFromHeaders, safeNext } from "./origin";
import {
  LETTER_BUCKET,
  LETTER_MAX_BYTES,
  LETTER_TYPES,
  REQUESTABLE_ROLES,
  passwordProblem,
} from "./config";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function siteOrigin() {
  return originFromHeaders(await headers());
}

// ------------------------------------------------------------------
// เข้าสู่ระบบ / ออกจากระบบ
// ------------------------------------------------------------------
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: explainError(error) };

  redirect(safeNext(text(formData, "next"), "/app"));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ------------------------------------------------------------------
// ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน
// ------------------------------------------------------------------
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  if (!email) return { error: "กรุณากรอกอีเมล" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/account/password`,
  });
  if (error && error.status === 429) return { error: explainError(error) };

  // ตอบแบบเดียวกันเสมอ เพื่อไม่เปิดเผยว่าอีเมลใดมีบัญชีในระบบ
  return { message: "ถ้าอีเมลนี้มีบัญชีในระบบ ท่านจะได้รับอีเมลพร้อมลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที" };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: explainError(error) };

  // บันทึกเวลาที่เปลี่ยนรหัสผ่าน (ผู้ใช้แก้ค่านี้เองไม่ได้ จึงทำฝั่งเซิร์ฟเวอร์)
  const { error: stampError } = await createAdminClient()
    .from("profiles")
    .update({ password_changed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (stampError) return { error: explainError(stampError) };

  revalidatePath("/", "layout");
  return { message: "เปลี่ยนรหัสผ่านแล้ว" };
}

// ------------------------------------------------------------------
// ขอบัญชีผู้ใช้ (หน้าสาธารณะ)
// ------------------------------------------------------------------
export async function submitAccountRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  // ช่องดักโปรแกรมอัตโนมัติ: คนจริงมองไม่เห็นช่องนี้จึงไม่กรอก
  if (text(formData, "website")) return { message: "ส่งคำขอแล้ว" };

  const titlePrefix = text(formData, "title_prefix");
  const firstName = text(formData, "first_name");
  const monasticName = text(formData, "monastic_name");
  const lastName = text(formData, "last_name");
  const positionText = text(formData, "position_text");
  const roleKey = text(formData, "role_key");
  const orgUnitId = text(formData, "org_unit_id");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const letter = formData.get("letter");

  if (!firstName) return { error: "กรุณากรอกชื่อ" };
  if (!positionText) return { error: "กรุณากรอกตำแหน่ง" };
  if (!(REQUESTABLE_ROLES as readonly string[]).includes(roleKey)) return { error: "กรุณาเลือกบทบาทที่ขอ" };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (!phone) return { error: "กรุณากรอกเบอร์ติดต่อ" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };
  if (!(letter instanceof File) || letter.size === 0) return { error: "กรุณาแนบหนังสือรับรอง" };
  const ext = LETTER_TYPES[letter.type];
  if (!ext) return { error: "หนังสือรับรองต้องเป็นไฟล์ PDF, JPG หรือ PNG" };
  if (letter.size > LETTER_MAX_BYTES) return { error: "ไฟล์หนังสือรับรองใหญ่เกิน 10 MB" };

  try {
    const admin = createAdminClient();

    const { data: role } = await admin.from("roles").select("key, requires_org_unit").eq("key", roleKey).single();
    if (!role) return { error: "กรุณาเลือกบทบาทที่ขอ" };
    if (role.requires_org_unit) {
      if (!orgUnitId) return { error: "กรุณาเลือกสังกัด (เขตปกครอง)" };
      const { data: unit } = await admin.from("org_units").select("id, is_active").eq("id", orgUnitId).maybeSingle();
      if (!unit || !unit.is_active) return { error: "ไม่พบเขตปกครองที่เลือก" };
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) return { error: explainError(createError) };
    const userId = created.user.id;

    // ถ้าขั้นใดต่อจากนี้ล้มเหลว ให้ลบบัญชีที่เพิ่งสร้าง เพื่อให้ยื่นใหม่ได้
    const rollback = async (error: unknown): Promise<FormState> => {
      await admin.auth.admin.deleteUser(userId);
      return { error: explainError(error) };
    };

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      title_prefix: titlePrefix,
      first_name: firstName,
      monastic_name: monasticName,
      last_name: lastName,
      phone,
      email,
      status: "pending",
    });
    if (profileError) return rollback(profileError);

    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(LETTER_BUCKET)
      .upload(path, letter, { contentType: letter.type, upsert: false });
    if (uploadError) return rollback(uploadError);

    const { error: requestError } = await admin.from("account_requests").insert({
      kind: "new",
      user_id: userId,
      position_text: positionText,
      requested_role_key: roleKey,
      org_unit_id: role.requires_org_unit ? orgUnitId : null,
      letter_path: path,
    });
    if (requestError) return rollback(requestError);
  } catch (error) {
    return { error: explainError(error) };
  }

  return {
    message:
      "ส่งคำขอแล้ว เมื่อผู้ดูแลหรือหน่วยเหนืออนุมัติ ท่านจะเข้าสู่ระบบได้ด้วยอีเมลและรหัสผ่านที่ตั้งไว้ ตรวจสถานะได้โดยเข้าสู่ระบบ",
  };
}

// ------------------------------------------------------------------
// บัญชีของฉัน
// ------------------------------------------------------------------
export async function updateMyProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_title_prefix: text(formData, "title_prefix"),
    p_first_name: text(formData, "first_name"),
    p_monastic_name: text(formData, "monastic_name"),
    p_last_name: text(formData, "last_name"),
    p_phone: text(formData, "phone"),
  });
  if (error) return { error: explainError(error) };
  revalidatePath("/", "layout");
  return { message: "บันทึกข้อมูลแล้ว" };
}

export async function requestReactivation(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_reactivation", { p_note: text(formData, "note") });
  if (error) return { error: explainError(error) };
  revalidatePath("/account");
  return { message: "ส่งคำขอเปิดใช้บัญชีแล้ว กรุณารอการพิจารณา" };
}

// ------------------------------------------------------------------
// ยืนยันตัวตน 2 ขั้น (รหัส 6 หลักจากแอป Authenticator)
// ------------------------------------------------------------------
export type MfaEnrollState =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

export async function startMfaEnroll(): Promise<MfaEnrollState> {
  const supabase = await createClient();
  // ล้างการตั้งค่าที่ค้างไว้ไม่สำเร็จก่อน
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `authenticator-${Date.now()}`,
  });
  if (error || !data) return { ok: false, error: explainError(error) };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = text(formData, "code").replace(/\s/g, "");
  let factorId = text(formData, "factor_id");
  if (!/^\d{6}$/.test(code)) return { error: "กรุณากรอกรหัส 6 หลัก" };

  const supabase = await createClient();
  if (!factorId) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    factorId = factors?.totp.find((f) => f.status === "verified")?.id ?? "";
    if (!factorId) return { error: "ยังไม่ได้ตั้งค่าการยืนยันตัวตน 2 ขั้น" };
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: explainError(error) };

  revalidatePath("/", "layout");
  redirect(safeNext(text(formData, "next"), "/account/mfa?done=1"));
}

export async function removeMfa(): Promise<FormState> {
  const supabase = await createClient();
  const { data: roles } = await supabase.rpc("my_role_rows");
  if ((roles as { mfa_required: boolean }[] | null)?.some((r) => r.mfa_required)) {
    return { error: "บทบาทของท่านบังคับใช้การยืนยันตัวตน 2 ขั้น จึงปิดไม่ได้" };
  }
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: explainError(error) };
  }
  revalidatePath("/account/mfa");
  return { message: "ปิดการยืนยันตัวตน 2 ขั้นแล้ว" };
}
