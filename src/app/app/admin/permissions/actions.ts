"use server";

import { revalidatePath } from "next/cache";

import { PERSONNEL_SCOPES, scopeRank, type PersonnelScope } from "@/lib/auth/config";
import { explainError, type ActionResult } from "@/lib/errors";
import { workspaceMenu } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const DENIED = "ท่านไม่มีสิทธิ์ทำรายการนี้";

/** RLS ยอมให้แก้เฉพาะผู้ดูแลระบบ ถ้าไม่มีสิทธิ์จะไม่มีแถวใดถูกแก้ ทุกการแก้ถูกบันทึกใน audit_logs โดย trigger */
export async function setRoleMenu(roleKey: string, href: string, enabled: boolean): Promise<ActionResult> {
  if (roleKey === "admin") return { ok: false, error: "ผู้ดูแลระบบเห็นทุกเมนูเสมอ" };
  const known = workspaceMenu.flatMap((g) => g.items).some((m) => m.href === href && m.href !== "/app");
  if (!known) return { ok: false, error: "ไม่พบเมนูนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_menus")
    .update({ enabled })
    .eq("role_key", roleKey)
    .eq("menu_href", href)
    .select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function setRolePersonnelScope(
  roleKey: string,
  view: PersonnelScope,
  edit: PersonnelScope,
): Promise<ActionResult> {
  if (roleKey === "admin") return { ok: false, error: "ผู้ดูแลระบบดูและแก้ไขได้ทุกเขตเสมอ" };
  if (!PERSONNEL_SCOPES.includes(view) || !PERSONNEL_SCOPES.includes(edit)) {
    return { ok: false, error: "ค่าที่เลือกไม่ถูกต้อง" };
  }
  if (scopeRank(edit) > scopeRank(view)) {
    return { ok: false, error: "สิทธิ์แก้ไขกว้างกว่าสิทธิ์ดูไม่ได้" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .update({ personnel_view: view, personnel_edit: edit })
    .eq("key", roleKey)
    .select("key");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}
