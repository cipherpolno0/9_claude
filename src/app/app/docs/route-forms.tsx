"use client";

import { useState } from "react";

import { Attachments } from "@/components/attachments";
import { selectClass } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RouteCandidate } from "@/lib/docs";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

import {
  cancelRoute,
  completeRoute,
  forwardDocument,
  orderDocument,
  proposeDocument,
  receiveRoute,
  remindRoutes,
  replyRoute,
} from "./actions";
import { Messages, UnitListPicker, useRun } from "./doc-forms";

/** ฟอร์มเส้นทางหนังสือ (บทที่ 28): เสนอ สั่งการ รายงานผล ส่งต่อ ตอบกลับ เตือนซ้ำ ลงรับ */

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProposeForm({ docId, commanders }: { docId: string; commanders: RouteCandidate[] }) {
  const { error, flash, pending, run } = useRun();
  const [to, setTo] = useState(commanders.length === 1 ? commanders[0].user_id : "");
  const [message, setMessage] = useState("เพื่อโปรดพิจารณา");
  if (!commanders.length) {
    return <p className="text-muted-foreground">หน่วยนี้ยังไม่มีผู้สั่งการ (เจ้าคณะหรือรองเจ้าคณะ) ในระบบ</p>;
  }
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="propose-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => proposeDocument(docId, to, message));
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="propose-to">เสนอถึง</Label>
        <select id="propose-to" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass}>
          <option value="">-- เลือก --</option>
          {commanders.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.name}
              {c.roles ? ` (${c.roles})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="propose-message">ข้อความเสนอ</Label>
        <textarea id="propose-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className={textareaClass} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          เสนอ
        </Button>
      </div>
    </form>
  );
}

function PeopleChecks({
  id,
  label,
  people,
  value,
  onChange,
  exclude = [],
}: {
  id: string;
  label: string;
  people: RouteCandidate[];
  value: string[];
  onChange: (v: string[]) => void;
  exclude?: string[];
}) {
  const list = people.filter((p) => !exclude.includes(p.user_id));
  return (
    <fieldset className="rounded-lg border p-3" data-testid={id}>
      <legend className="px-1 font-medium">{label}</legend>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีรายชื่อให้เลือก</p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {list.map((p) => (
            <label key={p.user_id} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                checked={value.includes(p.user_id)}
                onChange={(e) => onChange(e.target.checked ? [...value, p.user_id] : value.filter((v) => v !== p.user_id))}
              />
              <span>
                {p.name}
                {p.roles ? <span className="block text-sm text-muted-foreground">{p.roles}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** สั่งการ: คำสั่งการ มอบหมายผู้ดำเนินการ (กำหนดเสร็จ) แจ้งเพื่อทราบ */
export function OrderForm({ docId, members, parentId, parentFrom }: { docId: string; members: RouteCandidate[]; parentId: string | null; parentFrom?: string | null }) {
  const { error, setError, flash, pending, run } = useRun();
  const [message, setMessage] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [inform, setInform] = useState<string[]>([]);
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="order-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("order_due_incomplete")) return setError("กรุณากรอกกำหนดเสร็จให้ครบ");
        run(() =>
          orderDocument(docId, {
            message,
            assignees,
            dueOn: String(f.get("order_due") ?? ""),
            inform: inform.filter((i) => !assignees.includes(i)),
            parentId,
          }),
        );
      }}
    >
      {parentId ? <p className="text-sm text-muted-foreground">สั่งการเรื่องที่ {parentFrom ?? "ผู้เสนอ"} เสนอมา (เรื่องที่เสนอจะปิดเมื่อสั่งการ)</p> : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="order-message">
          คำสั่งการ<span className="text-destructive"> *</span>
        </Label>
        <textarea id="order-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className={textareaClass} />
      </div>
      <PeopleChecks id="order-assignees" label="มอบหมายผู้ดำเนินการ" people={members} value={assignees} onChange={setAssignees} />
      <ThaiDateInput label="กำหนดเสร็จ" name="order_due" hint="เว้นว่าง = ไม่กำหนด" className="sm:max-w-md" />
      <PeopleChecks id="order-inform" label="แจ้งเพื่อทราบ" people={members} value={inform} onChange={setInform} exclude={assignees} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          บันทึกคำสั่งการ
        </Button>
      </div>
    </form>
  );
}

/** ผู้ได้รับมอบหมาย: รายงานผล (ข้อความ + ไฟล์) / ผู้ได้รับแจ้ง: รับทราบ */
export function RouteDoneForm({
  routeId,
  action,
  unitId,
  currentUserId,
}: {
  routeId: string;
  action: "act" | "inform";
  unitId: string;
  currentUserId: string;
}) {
  const { error, flash, pending, run } = useRun();
  const [note, setNote] = useState("");
  if (action === "inform") {
    return (
      <div className="flex flex-col gap-2" data-testid="ack-form">
        <Messages error={error} flash={flash} />
        <div>
          <Button type="button" disabled={pending} onClick={() => run(() => completeRoute(routeId, ""))}>
            รับทราบ
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="done-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => completeRoute(routeId, note));
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`done-${routeId}`}>รายงานผลการดำเนินการ</Label>
        <textarea id={`done-${routeId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className={textareaClass} />
      </div>
      <Attachments
        entityTable="document_routes"
        entityId={routeId}
        orgUnitId={unitId}
        currentUserId={currentUserId}
        inputLabel="แนบไฟล์ผลการดำเนินการ"
        emptyText="ยังไม่ได้แนบไฟล์"
      />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          รายงานผลว่าเสร็จแล้ว
        </Button>
      </div>
    </form>
  );
}

export function CancelRouteButton({ routeId }: { routeId: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => window.confirm("ยกเลิกรายการนี้?") && run(() => cancelRoute(routeId))}
      >
        ยกเลิก
      </Button>
      <Messages error={error} flash={flash} />
    </span>
  );
}

export function ForwardForm({ docId, units, ownUnitId }: { docId: string; units: AccessibleOrgUnit[]; ownUnitId: string }) {
  const { error, flash, pending, run, router } = useRun();
  const [value, setValue] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="forward-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => forwardDocument(docId, value.map((u) => u.id), message),
          () => {
            setValue([]);
            router.refresh();
          },
        );
      }}
    >
      <UnitListPicker units={units} value={value} onChange={setValue} ownUnitId={ownUnitId} legend="ส่งต่อถึงหน่วยในระบบ" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="forward-message">ข้อความถึงหน่วยปลายทาง</Label>
        <Input id="forward-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending || value.length === 0}>
          ส่งต่อ
        </Button>
      </div>
    </form>
  );
}

/** หน่วยผู้รับตอบหนังสือที่ต้องการคำตอบ (ข้อความ + ไฟล์ แก้คำตอบได้) */
export function ReplyForm({
  routeId,
  unitId,
  currentUserId,
  initial,
}: {
  routeId: string;
  unitId: string;
  currentUserId: string;
  initial: string | null;
}) {
  const { error, flash, pending, run } = useRun();
  const [text, setText] = useState(initial ?? "");
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => replyRoute(routeId, text));
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="reply-text">คำตอบ</Label>
        <textarea id="reply-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} className={textareaClass} />
      </div>
      <Attachments
        entityTable="document_routes"
        entityId={routeId}
        orgUnitId={unitId}
        currentUserId={currentUserId}
        inputLabel="แนบไฟล์คำตอบ"
        emptyText="ยังไม่ได้แนบไฟล์"
      />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {initial ? "แก้คำตอบ" : "ส่งคำตอบ"}
        </Button>
      </div>
    </form>
  );
}

export function RemindButtons({ docId, unread, unreplied }: { docId: string; unread: number; unreplied: number | null }) {
  const { error, flash, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2" data-testid="remind-box">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending || unread === 0} onClick={() => run(() => remindRoutes(docId, "unread"))}>
          เตือนหน่วยที่ยังไม่อ่าน ({unread})
        </Button>
        {unreplied !== null ? (
          <Button type="button" variant="outline" disabled={pending || unreplied === 0} onClick={() => run(() => remindRoutes(docId, "unreplied"))}>
            เตือนหน่วยที่ยังไม่ตอบ ({unreplied})
          </Button>
        ) : null}
      </div>
      <Messages error={error} flash={flash} />
    </div>
  );
}

/** ลงรับจากกล่องหนังสือเข้า (ได้เลขทะเบียนรับของหน่วยอัตโนมัติ) */
export function ReceiveRouteForm({ routeId }: { routeId: string }) {
  const { error, flash, pending, run, router } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="receive-route">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rcv-${routeId}`}>การปฏิบัติ / หมายเหตุ</Label>
        <Input id={`rcv-${routeId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="button" disabled={pending} onClick={() => run(() => receiveRoute(routeId, [], note), (r) => router.push(`/app/docs/${r.id}`))}>
          ลงรับ
        </Button>
      </div>
    </div>
  );
}
