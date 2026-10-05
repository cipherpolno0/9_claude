"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { REGISTRY_TAG } from "@/lib/registry";
import { createClient } from "@/lib/supabase/server";

import type { Decision } from "./labels";

function refresh(requestId?: string) {
  revalidatePath("/app");
  revalidatePath("/app/approvals");
  revalidatePath("/app/admin/demo");
  revalidatePath("/app/requests");
  if (requestId) revalidatePath(`/app/approvals/${requestId}`);
}

/** ยื่นคำขอผ่านเครื่องอนุมัติกลาง คืนรหัสคำขอเมื่อสำเร็จ */
export async function submitRequest(input: {
  typeKey: string;
  orgUnitId: string;
  title: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_request", {
    p_type_key: input.typeKey,
    p_org_unit_id: input.orgUnitId || null,
    p_title: input.title,
    p_payload: input.payload,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, id: data as string, message: "ยื่นคำขอแล้ว" };
}

export async function decideRequest(input: {
  requestId: string;
  decision: Decision;
  comment: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_comment: input.comment,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh(input.requestId);
  if (input.decision === "approved") {
    // การอนุมัติขั้นสุดท้ายของคำขอจัดตั้ง-ยุบสำนัก เปลี่ยนทะเบียนสถานที่ จึงล้างแคชของหน้าทะเบียนและหน้าสาธารณะด้วย
    revalidatePath("/app/places");
    revalidateTag(REGISTRY_TAG, { expire: 0 });
  }
  return { ok: true, message: "บันทึกผลการพิจารณาแล้ว" };
}

export async function resubmitRequest(input: {
  requestId: string;
  title: string;
  payload: Record<string, unknown>;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_request", {
    p_request_id: input.requestId,
    p_title: input.title,
    p_payload: input.payload,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh(input.requestId);
  return { ok: true, message: "ส่งคำขอใหม่แล้ว" };
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { ok: false, error: explainError(error) };
  refresh(requestId);
  return { ok: true, message: "ยกเลิกคำขอแล้ว" };
}
