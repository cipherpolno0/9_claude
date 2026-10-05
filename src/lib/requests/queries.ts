import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { RequestStatus, StepStatus, TimelineData } from "./labels";
import type { OrgLevel } from "@/lib/org-units";

export type PendingRequest = {
  request_id: string;
  request_no: string;
  type_name: string;
  title: string;
  org_unit_name: string;
  requester_name: string;
  submitted_at: string;
  step_no: number;
  step_unit_name: string;
  waiting_since: string;
};

/** งานรอพิจารณาของผู้ใช้ปัจจุบัน */
export async function fetchMyPendingRequests(): Promise<PendingRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_pending_requests");
  return (data as PendingRequest[] | null) ?? [];
}

export type RequestDetail = {
  id: string;
  type_key: string;
  request_no: string;
  requester_id: string;
  org_unit_id: string;
  title: string;
  payload: Record<string, unknown>;
  status: RequestStatus;
  current_step: number | null;
  requester_name: string;
  org_unit_name: string;
  timeline: TimelineData;
  events: { id: number; action: string; comment: string | null; created_at: string; actor_name: string }[];
  canDecide: boolean;
  /** เวลาที่ขั้นปัจจุบันเริ่มรอพิจารณา (ว่าง = ไม่มีขั้นที่รออยู่) */
  pendingSince: string | null;
  submitted_at: string;
  decided_at: string | null;
};

/** คำขอ 1 รายการพร้อมเส้นเวลา (คืน null ถ้าไม่พบหรือไม่มีสิทธิ์เห็น) */
export async function fetchRequestDetail(id: string): Promise<RequestDetail | null> {
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("requests")
    .select(
      "id, type_key, request_no, requester_id, org_unit_id, title, payload, status, current_step, submitted_at, decided_at, " +
        "request_types(name), org_units(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;
  const row = r as unknown as {
    id: string;
    type_key: string;
    request_no: string;
    requester_id: string;
    org_unit_id: string;
    title: string;
    payload: Record<string, unknown>;
    status: RequestStatus;
    current_step: number | null;
    submitted_at: string;
    decided_at: string | null;
    request_types: { name: string } | null;
    org_units: { name: string } | null;
  };

  const [stepsRes, eventsRes, peopleRes] = await Promise.all([
    supabase
      .from("request_steps")
      .select("id, step_no, level, status, comment, decided_at, decided_by, pending_since, org_units(name)")
      .eq("request_id", id)
      .order("step_no"),
    supabase
      .from("request_events")
      .select("id, action, comment, created_at, actor_id")
      .eq("request_id", id)
      .order("id"),
    // ชื่อผู้ยื่นและผู้พิจารณา (เฉพาะชื่อ ไม่มีอีเมลหรือเบอร์ติดต่อ)
    supabase.rpc("request_people", { p_request_id: id }),
  ]);
  const names = new Map(
    ((peopleRes.data ?? []) as { user_id: string; full_name: string }[]).map((p) => [p.user_id, p.full_name]),
  );

  const steps = (stepsRes.data ?? []) as unknown as {
    id: string;
    step_no: number;
    level: OrgLevel;
    status: StepStatus;
    comment: string | null;
    decided_at: string | null;
    decided_by: string | null;
    pending_since: string | null;
    org_units: { name: string } | null;
  }[];

  const pending = steps.find((s) => s.status === "pending");
  let canDecide = false;
  if (pending && row.status === "pending") {
    const { data } = await supabase.rpc("can_decide_step", { p_step_id: pending.id });
    canDecide = data === true;
  }

  return {
    id: row.id,
    type_key: row.type_key,
    request_no: row.request_no,
    requester_id: row.requester_id,
    org_unit_id: row.org_unit_id,
    title: row.title,
    payload: row.payload ?? {},
    status: row.status,
    current_step: row.current_step,
    requester_name: names.get(row.requester_id) ?? "-",
    org_unit_name: row.org_units?.name ?? "-",
    canDecide,
    pendingSince: row.status === "pending" ? (pending?.pending_since ?? null) : null,
    submitted_at: row.submitted_at,
    decided_at: row.decided_at,
    timeline: {
      request_no: row.request_no,
      type_name: row.request_types?.name ?? "",
      status: row.status,
      submitted_at: row.submitted_at,
      decided_at: row.decided_at,
      steps: steps.map((s) => ({
        step_no: s.step_no,
        level: s.level,
        unit_name: s.org_units?.name ?? "-",
        status: s.status,
        decided_at: s.decided_at,
        decider_name: s.decided_by ? (names.get(s.decided_by) ?? null) : null,
        comment: s.comment,
      })),
    },
    events: ((eventsRes.data ?? []) as unknown as {
      id: number;
      action: string;
      comment: string | null;
      created_at: string;
      actor_id: string | null;
    }[]).map((e) => ({
      id: e.id,
      action: e.action,
      comment: e.comment,
      created_at: e.created_at,
      actor_name: e.actor_id ? (names.get(e.actor_id) ?? "-") : "-",
    })),
  };
}
