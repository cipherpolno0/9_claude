import { ROUTE_ACTION_LABEL, type DocDetail, type DocRoute } from "./docs";
import { thaiDate } from "./thai";

/**
 * เส้นทางเดินของหนังสือ (หน้า ติดตามหนังสือ) สร้างจาก document_detail ชุดเดียว
 * ฐานข้อมูลกรองเส้นทางตามสิทธิ์แล้ว (หน่วยปลายทางเห็นเฉพาะเส้นทางถึงหน่วยตน)
 */

export type TrackEvent = {
  at: string;
  title: string;
  detail?: string;
  tone?: "done" | "warn" | "muted";
};

export type TrackHolder = {
  who: string;
  what: string;
  since: string;
  days: number;
  dueOn?: string | null;
  overdue?: boolean;
};

export type TrackState = "draft" | "open" | "closed" | "cancelled";

/** วันที่ตามเวลาประเทศไทย YYYY-MM-DD */
export const bkkDate = (iso: string | Date) =>
  (typeof iso === "string" ? new Date(iso) : iso).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** จำนวนวันตามปฏิทิน (เวลาไทย) จาก since ถึง today */
export function daysSince(since: string, today: string = bkkDate(new Date())): number {
  const a = Date.parse(`${since.length > 10 ? bkkDate(since) : since}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** ส่งถึงหน่วยมากกว่านี้ = สรุปเป็นยอดแทนรายหน่วย */
export const FORWARD_DETAIL_LIMIT = 10;

const nameOf = (r: DocRoute) => r.to_name ?? "-";

function routeEvents(routes: DocRoute[]): TrackEvent[] {
  const out: TrackEvent[] = [];
  const forwards = routes.filter((r) => r.action === "forward");
  const others = routes.filter((r) => r.action !== "forward");
  if (forwards.length > FORWARD_DETAIL_LIMIT) {
    const live = forwards.filter((r) => r.status !== "cancelled");
    const first = forwards.reduce((a, b) => (a.sent_at < b.sent_at ? a : b));
    const read = live.filter((r) => r.read_at).length;
    const received = live.filter((r) => r.status === "received").length;
    const replied = live.filter((r) => r.reply_text).length;
    out.push({
      at: first.sent_at,
      title: `ส่งถึงหน่วยในระบบ ${live.length.toLocaleString("th-TH")} หน่วย`,
      detail: `เปิดอ่าน ${read.toLocaleString("th-TH")} · ลงรับ ${received.toLocaleString("th-TH")}${replied ? ` · ตอบกลับ ${replied.toLocaleString("th-TH")}` : ""} หน่วย (รายละเอียดดูที่หน้าหนังสือ)`,
    });
  } else {
    for (const r of forwards) {
      const cancelled = r.status === "cancelled";
      out.push({
        at: r.sent_at,
        title: `ส่งถึง ${nameOf(r)}${cancelled ? " (ยกเลิก)" : ""}`,
        detail: r.message || undefined,
        tone: cancelled ? "muted" : undefined,
      });
      if (r.read_at) out.push({ at: r.read_at, title: `${nameOf(r)} เปิดอ่าน` });
      if (r.received_at) {
        out.push({
          at: r.received_at,
          title: `${nameOf(r)} ลงรับ${r.receive_no ? ` เลขรับ ${r.receive_no}/${r.receive_year}` : ""}`,
          tone: "done",
        });
      }
      if (r.replied_at) out.push({ at: r.replied_at, title: `${nameOf(r)} ตอบกลับ`, detail: r.reply_text ?? undefined, tone: "done" });
    }
  }
  for (const r of others) {
    const cancelled = r.status === "cancelled";
    const tail = cancelled ? " (ยกเลิก)" : "";
    if (r.action === "order") {
      out.push({ at: r.sent_at, title: `${r.from_name ?? "ผู้สั่งการ"} สั่งการ`, detail: r.message, tone: "done" });
      continue;
    }
    if (r.action === "propose") {
      out.push({ at: r.sent_at, title: `${r.from_name ?? "-"} เสนอ ${nameOf(r)}${tail}`, detail: r.message || undefined, tone: cancelled ? "muted" : undefined });
    } else if (r.action === "act") {
      out.push({
        at: r.sent_at,
        title: `มอบหมาย ${nameOf(r)} ดำเนินการ${r.due_on ? ` (กำหนดเสร็จ ${thaiDate(r.due_on, "short")})` : ""}${tail}`,
        tone: cancelled ? "muted" : undefined,
      });
    } else {
      out.push({ at: r.sent_at, title: `${ROUTE_ACTION_LABEL[r.action]} ${nameOf(r)}${tail}`, tone: cancelled ? "muted" : undefined });
    }
    if (r.read_at && r.action !== "inform") out.push({ at: r.read_at, title: `${nameOf(r)} เปิดอ่าน` });
    if (r.done_at) {
      const title =
        r.action === "act" ? `${nameOf(r)} รายงานผล` : r.action === "inform" ? `${nameOf(r)} รับทราบ` : `${nameOf(r)} สั่งการแล้ว`;
      out.push({ at: r.done_at, title, detail: r.action === "act" ? (r.done_note ?? undefined) : undefined, tone: "done" });
    }
  }
  return out;
}

export function buildTrack(d: DocDetail, today: string = bkkDate(new Date())) {
  const events: TrackEvent[] = [];
  if (d.direction === "send") {
    events.push({ at: d.created_at, title: "สร้างร่างหนังสือ", detail: d.registered_by_name ? `โดย ${d.registered_by_name}` : undefined });
    if (d.issued_at) events.push({ at: d.issued_at, title: `ออกเลข ที่ ${d.doc_no}`, detail: d.issued_by_name ? `โดย ${d.issued_by_name}` : undefined });
    if (d.sent_at) events.push({ at: d.sent_at, title: "ส่งหนังสือ", detail: d.sent_by_name ? `โดย ${d.sent_by_name}` : undefined, tone: "done" });
  } else {
    const sr = d.source_route;
    if (sr?.sent_at) {
      events.push({ at: sr.sent_at, title: `${sr.from_unit_name} ส่งหนังสือถึงหน่วย`, detail: sr.message || undefined });
      if (sr.read_at && sr.read_at < (d.received_at ?? "")) events.push({ at: sr.read_at, title: "เปิดอ่านหนังสือเข้า" });
    }
    if (d.received_at) {
      events.push({
        at: d.received_at,
        title: `ลงทะเบียนรับ เลขรับ ${d.seq_no}/${d.number_year}`,
        detail: d.registered_by_name ? `โดย ${d.registered_by_name}` : undefined,
        tone: "done",
      });
    }
    if (sr?.replied_at) events.push({ at: sr.replied_at, title: "ตอบกลับหน่วยต้นทาง", detail: sr.reply_text ?? undefined, tone: "done" });
  }
  events.push(...routeEvents(d.routes ?? []));
  for (const e of d.close_events ?? []) {
    events.push({
      at: e.at,
      title: e.action === "close" ? "ปิดเรื่อง (เข้าคลังเก็บ)" : "เปิดเรื่องใหม่",
      detail: [e.actor_name ? `โดย ${e.actor_name}` : "", e.note].filter(Boolean).join(" · ") || undefined,
      tone: e.action === "close" ? "done" : "warn",
    });
  }
  if (d.status === "cancelled" && d.cancelled_at) {
    events.push({ at: d.cancelled_at, title: "ยกเลิกหนังสือ", detail: d.cancel_reason ?? undefined, tone: "warn" });
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const state: TrackState =
    d.status === "cancelled" ? "cancelled" : d.status === "draft" ? "draft" : d.closed_at ? "closed" : "open";
  const holders: TrackHolder[] = [];
  const hold = (who: string, what: string, since: string, extra: Partial<TrackHolder> = {}) =>
    holders.push({ who, what, since, days: daysSince(since, today), ...extra });

  if (state === "draft") {
    hold(d.org_unit_name, "ร่าง ยังไม่ออกเลข", d.updated_at);
  } else if (state === "open") {
    const live = (d.routes ?? []).filter((r) => r.status === "pending" || r.status === "read");
    for (const r of live.filter((x) => x.action === "propose")) hold(nameOf(r), "รอสั่งการ", r.sent_at);
    for (const r of live.filter((x) => x.action === "act")) {
      hold(nameOf(r), "รอรายงานผล", r.sent_at, { dueOn: r.due_on, overdue: !!r.due_on && r.due_on < today });
    }
    const waiting = live.filter((x) => x.action === "forward");
    const unreplied = (d.routes ?? []).filter((r) => r.action === "forward" && r.status === "received" && d.reply_required && !r.reply_text);
    if (waiting.length > FORWARD_DETAIL_LIMIT) {
      const oldest = waiting.reduce((a, b) => (a.sent_at < b.sent_at ? a : b));
      hold(`${waiting.length.toLocaleString("th-TH")} หน่วย`, "รอลงรับ", oldest.sent_at);
    } else {
      for (const r of waiting) hold(nameOf(r), r.status === "read" ? "เปิดอ่านแล้ว รอลงรับ" : "ยังไม่เปิดอ่าน รอลงรับ", r.sent_at);
    }
    if (unreplied.length > FORWARD_DETAIL_LIMIT) {
      const oldest = unreplied.reduce((a, b) => ((a.received_at ?? a.sent_at) < (b.received_at ?? b.sent_at) ? a : b));
      hold(`${unreplied.length.toLocaleString("th-TH")} หน่วย`, "รอคำตอบ", oldest.received_at ?? oldest.sent_at, { dueOn: d.reply_due_on });
    } else {
      for (const r of unreplied) {
        hold(nameOf(r), "ลงรับแล้ว รอคำตอบ", r.received_at ?? r.sent_at, {
          dueOn: d.reply_due_on,
          overdue: !!d.reply_due_on && d.reply_due_on < today,
        });
      }
    }
    if (!holders.length) {
      const last = events.length ? events[events.length - 1].at : d.updated_at;
      hold(d.scope === "owner" ? `${d.org_unit_name} (งานสารบรรณ)` : d.org_unit_name, "ดำเนินการต่อ หรือปิดเรื่อง", last);
    }
  }
  const startedAt = d.received_at ?? d.issued_at ?? d.created_at;
  const endAt = state === "closed" ? d.closed_at : state === "cancelled" ? d.cancelled_at : null;
  const totalDays = daysSince(startedAt, endAt ? bkkDate(endAt) : today);
  return { events, holders, state, startedAt, totalDays };
}
