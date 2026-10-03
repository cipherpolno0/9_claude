"use server";

import { revalidatePath } from "next/cache";

import { LETTER_BUCKET } from "@/lib/auth/config";
import { explainError, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/users";

async function call(fn: string, args: Record<string, unknown>, message: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: explainError(error) };
    revalidatePath(PAGE);
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** อนุมัติคำขอ: สิทธิ์ตรวจในฐานข้อมูล (ผู้ดูแลระบบ หรือหน่วยเหนือ) */
export async function approveRequest(input: {
  requestId: string;
  roleKey: string | null;
  orgUnitId: string | null;
  note: string;
}) {
  return call(
    "approve_account_request",
    {
      p_request_id: input.requestId,
      p_role_key: input.roleKey,
      p_org_unit_id: input.orgUnitId || null,
      p_note: input.note,
    },
    "อนุมัติแล้ว",
  );
}

export async function rejectRequest(input: { requestId: string; note: string }) {
  return call("reject_account_request", { p_request_id: input.requestId, p_note: input.note }, "บันทึกผลไม่อนุมัติแล้ว");
}

export async function setAccountStatus(input: { userId: string; status: "active" | "suspended"; reason: string }) {
  return call(
    "set_account_status",
    { p_user_id: input.userId, p_status: input.status, p_reason: input.reason },
    input.status === "active" ? "เปิดใช้บัญชีแล้ว" : "ระงับบัญชีแล้ว",
  );
}

export async function grantRole(input: { userId: string; roleKey: string; orgUnitId: string | null }) {
  return call(
    "grant_user_role",
    { p_user_id: input.userId, p_role_key: input.roleKey, p_org_unit_id: input.orgUnitId || null },
    "เพิ่มบทบาทแล้ว",
  );
}

export async function endRole(userRoleId: string) {
  return call("end_user_role", { p_user_role_id: userRoleId }, "สิ้นสุดบทบาทแล้ว");
}

/** ลิงก์ดูหนังสือรับรอง (ใช้ได้ 5 นาที) ออกให้เฉพาะผู้ที่มีสิทธิ์เห็นคำขอนั้น */
export async function getLetterUrl(requestId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    // อ่านด้วยสิทธิ์ของผู้ใช้: ถ้า RLS ไม่ให้เห็นคำขอ จะไม่ได้แถวกลับมา
    const { data: request } = await supabase
      .from("account_requests")
      .select("letter_path")
      .eq("id", requestId)
      .maybeSingle();
    if (!request?.letter_path) return { ok: false, error: "ไม่พบหนังสือรับรอง หรือท่านไม่มีสิทธิ์ดู" };

    const { data, error } = await createAdminClient()
      .storage.from(LETTER_BUCKET)
      .createSignedUrl(request.letter_path, 300);
    if (error || !data) return { ok: false, error: explainError(error) };
    return { ok: true, url: data.signedUrl };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
