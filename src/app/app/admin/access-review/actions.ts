"use server";

import { revalidatePath } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/access-review";

export async function openReview(yearBe: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_access_review", { p_year_be: yearBe });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(PAGE);
  return { ok: true, message: `เปิดรอบทบทวนประจำปี พ.ศ. ${yearBe} แล้ว` };
}

export async function decideReview(input: {
  roundId: string;
  userId: string;
  decision: "keep" | "suspend";
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_access_review", {
    p_round_id: input.roundId,
    p_user_id: input.userId,
    p_decision: input.decision,
  });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(PAGE);
  return { ok: true, message: input.decision === "keep" ? "ยืนยันคงไว้แล้ว" : "ระงับบัญชีแล้ว" };
}
