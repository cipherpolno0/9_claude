"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, Field, InfoText, selectClass } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLOSING_HINTS,
  DOC_CLASS_LABEL,
  DOC_CLASSES,
  DOC_KIND_LABEL,
  DOC_KINDS,
  DOC_URGENCIES,
  DOC_URGENCY_LABEL,
  docNoExample,
  needsRecipient,
  SALUTATION_HINTS,
  type DocKind,
} from "@/lib/docs";
import { todayIso } from "@/lib/inventory";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

import {
  cancelDocument,
  discardDraft,
  issueNumber,
  registerReceived,
  saveDraft,
  saveLetterhead,
  sendDocument,
  setViewers,
  updateReceived,
} from "./actions";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Result = { ok: boolean; message?: string; error?: string; id?: string };
export type Candidate = { user_id: string; name: string };

/** สถานะของฟอร์มเล็ก: ส่ง > แสดงผล > โหลดหน้าใหม่ หรือไปหน้าใหม่ */
export function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setFlash(r.message ?? "บันทึกแล้ว");
        if (after) after(r);
        else router.refresh();
      } else setError(r.error ?? "บันทึกไม่สำเร็จ");
    });
  };
  return { error, setError, flash, pending, run, router };
}

export function Messages({ error, flash }: { error: string | null; flash: string | null }) {
  return (
    <div aria-live="polite">
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </div>
  );
}

const fd = (f: FormData, k: string) => String(f.get(k) ?? "");

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** เลือกผู้เห็นหนังสือลับ (เฉพาะผู้มีสิทธิ์ดูสารบรรณของหน่วย) */
export function ViewerChecks({
  candidates,
  value,
  onChange,
  selfId,
}: {
  candidates: Candidate[];
  value: string[];
  onChange: (v: string[]) => void;
  selfId?: string;
}) {
  const others = candidates.filter((c) => c.user_id !== selfId);
  return (
    <fieldset className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-amber-950" data-testid="viewer-checks">
      <legend className="px-1 font-semibold">ผู้ที่ระบุชื่อให้เห็นหนังสือลับ</legend>
      <p className="text-sm">ผู้ลงทะเบียนเห็นเสมอ ผู้อื่นของหน่วยเห็นเพียงเลขและวันที่ ไม่เห็นเรื่องและไฟล์</p>
      {others.length === 0 ? (
        <p className="mt-2 text-sm">ไม่มีผู้มีสิทธิ์ดูหนังสือของหน่วยนี้คนอื่นให้เลือก</p>
      ) : (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {others.map((c) => (
            <label key={c.user_id} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                checked={value.includes(c.user_id)}
                onChange={(e) => onChange(e.target.checked ? [...value, c.user_id] : value.filter((v) => v !== c.user_id))}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ChoiceRow({
  kind,
  setKind,
  urgency,
  setUrgency,
  classification,
  setClassification,
  kinds = DOC_KINDS,
}: {
  kind: string;
  setKind: (v: string) => void;
  urgency: string;
  setUrgency: (v: string) => void;
  classification: string;
  setClassification: (v: string) => void;
  kinds?: readonly DocKind[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SelectField id="doc-kind" label="ชนิดหนังสือ" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: DOC_KIND_LABEL[k] }))} />
      <SelectField
        id="doc-urgency"
        label="ชั้นความเร็ว"
        value={urgency}
        onChange={setUrgency}
        options={DOC_URGENCIES.map((u) => ({ value: u, label: DOC_URGENCY_LABEL[u] }))}
      />
      <SelectField
        id="doc-class"
        label="ชั้นความลับ"
        value={classification}
        onChange={setClassification}
        options={DOC_CLASSES.map((c) => ({ value: c, label: DOC_CLASS_LABEL[c] }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// ทะเบียนหนังสือรับ
// ---------------------------------------------------------------
export type ReceiveInitial = {
  id: string;
  kind: DocKind;
  docNo: string;
  docDate: string | null;
  fromText: string;
  toText: string;
  subject: string;
  urgency: string;
  classification: string;
  note: string;
};

export function ReceiveForm({
  unitId,
  candidates,
  selfId,
  doc,
}: {
  unitId: string;
  candidates: Candidate[];
  selfId: string;
  doc?: ReceiveInitial;
}) {
  const { error, setError, flash, pending, run, router } = useRun();
  const [kind, setKind] = useState<string>(doc?.kind ?? "external");
  const [urgency, setUrgency] = useState(doc?.urgency ?? "normal");
  const [classification, setClassification] = useState(doc?.classification ?? "normal");
  const [viewers, setViewersState] = useState<string[]>([]);
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="receive-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("doc_date_incomplete")) return setError("กรุณากรอกวันที่ของหนังสือให้ครบ");
        const input = {
          kind,
          docNo: fd(f, "doc_no"),
          docDate: fd(f, "doc_date"),
          fromText: fd(f, "from_text"),
          toText: fd(f, "to_text"),
          subject: fd(f, "subject"),
          urgency,
          classification,
          note: fd(f, "note"),
          viewers,
        };
        run(
          () => (doc ? updateReceived(doc.id, input) : registerReceived(unitId, input)),
          (r) => router.push(`/app/docs/${doc?.id ?? r.id}`),
        );
      }}
    >
      <ChoiceRow kind={kind} setKind={setKind} urgency={urgency} setUrgency={setUrgency} classification={classification} setClassification={setClassification} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="เลขที่หนังสือ (ตามที่ต้นทางออก)" name="doc_no" id="doc-no" defaultValue={doc?.docNo} maxLength={80} hint="เช่น ที่ พศ 0006/123 (ไม่มีให้เว้นว่าง)" />
        <ThaiDateInput label="ลงวันที่" name="doc_date" defaultValue={doc?.docDate ?? undefined} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="จาก" name="from_text" id="from-text" defaultValue={doc?.fromText} required maxLength={300} />
        <Field label="ถึง" name="to_text" id="to-text" defaultValue={doc?.toText} maxLength={300} />
      </div>
      <Field label="เรื่อง" name="subject" id="subject" defaultValue={doc?.subject} required maxLength={500} />
      {classification !== "normal" && !doc ? (
        <ViewerChecks candidates={candidates} value={viewers} onChange={setViewersState} selfId={selfId} />
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">การปฏิบัติ / หมายเหตุ</Label>
        <textarea id="note" name="note" defaultValue={doc?.note} maxLength={1000} className={textareaClass} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {doc ? "บันทึกการแก้ไข" : "ลงทะเบียนรับ"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// ร่างหนังสือส่ง
// ---------------------------------------------------------------
export type DraftInitial = {
  id: string;
  status: string;
  kind: DocKind;
  toText: string;
  toUnits: { id: string; name: string }[];
  subject: string;
  urgency: string;
  classification: string;
  salutation: string;
  body: string;
  closing: string;
  signerName: string;
  signerPosition: string;
  note: string;
  viewers: string[];
  replyRequired: boolean;
  replyDueOn: string | null;
};

/** หน่วยใต้สังกัดจากต้นไม้เขตปกครอง: depth 1 = ชั้นถัดไป / all = ทุกชั้น */
function childrenOf(units: AccessibleOrgUnit[], rootId: string, depth: 1 | "all"): AccessibleOrgUnit[] {
  const byParent = new Map<string, AccessibleOrgUnit[]>();
  for (const u of units) {
    if (!u.parent_id) continue;
    const list = byParent.get(u.parent_id) ?? [];
    list.push(u);
    byParent.set(u.parent_id, list);
  }
  const out: AccessibleOrgUnit[] = [];
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) for (const c of byParent.get(id) ?? []) {
      out.push(c);
      next.push(c.id);
    }
    if (depth === 1) break;
    frontier = next;
  }
  return out;
}

const MAX_UNITS = 2000;

/** หน่วยในระบบที่ส่งถึง: เลือกจากต้นไม้เขตปกครอง ทีละหน่วย หรือทั้งชั้นถัดไป / ทุกชั้นใต้สังกัด */
export function UnitListPicker({
  units,
  value,
  onChange,
  ownUnitId,
  legend = "ส่งถึงหน่วยในระบบ (หน่วยปลายทางจะได้รายการในกล่องหนังสือเข้า)",
}: {
  units: AccessibleOrgUnit[];
  value: { id: string; name: string }[];
  onChange: (v: { id: string; name: string }[]) => void;
  ownUnitId: string;
  legend?: string;
}) {
  const [picked, setPicked] = useState("");
  const [key, setKey] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const central = units.find((u) => u.level === "central");
  const ownChildren = childrenOf(units, ownUnitId, 1);
  const ownAll = childrenOf(units, ownUnitId, "all");
  const addMany = (list: AccessibleOrgUnit[]) => {
    const have = new Set(value.map((v) => v.id));
    const fresh = list.filter((u) => u.id !== ownUnitId && !have.has(u.id));
    const room = MAX_UNITS - value.length;
    onChange([...value, ...fresh.slice(0, room).map((u) => ({ id: u.id, name: u.name }))]);
    setNote(
      fresh.length > room
        ? `เพิ่มได้ ${room} หน่วย (ไม่เกิน ${MAX_UNITS} หน่วยต่อฉบับ)`
        : fresh.length
          ? `เพิ่ม ${fresh.length.toLocaleString("th-TH")} หน่วย`
          : "หน่วยที่เลือกอยู่ในรายการแล้ว",
    );
    setPicked("");
    setKey((k) => k + 1);
  };
  const pickedUnit = units.find((u) => u.id === picked);
  const shown = value.slice(0, 12);
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="to-units">
      <legend className="px-1 font-medium">{legend}</legend>
      {value.length ? (
        <>
          <p className="text-sm font-semibold" data-testid="to-units-count">
            เลือกแล้ว {value.length.toLocaleString("th-TH")} หน่วย
          </p>
          <ul className="flex flex-wrap gap-2">
            {shown.map((u) => (
              <li key={u.id} className="flex items-center gap-1 rounded-full border bg-secondary px-3 py-1">
                {u.name}
                <button
                  type="button"
                  className="ml-1 rounded px-1 text-destructive hover:underline"
                  aria-label={`เอา ${u.name} ออก`}
                  onClick={() => onChange(value.filter((v) => v.id !== u.id))}
                >
                  ×
                </button>
              </li>
            ))}
            {value.length > shown.length ? (
              <li className="px-1 py-1 text-sm text-muted-foreground">และอีก {(value.length - shown.length).toLocaleString("th-TH")} หน่วย</li>
            ) : null}
          </ul>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([])}>
              ล้างทั้งหมด
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">ยังไม่ได้เลือก (ผู้รับภายนอกพิมพ์ที่ช่อง ถึง อย่างเดียว)</p>
      )}
      {ownChildren.length ? (
        <div className="flex flex-wrap gap-2" data-testid="own-subunits">
          <Button type="button" variant="outline" onClick={() => addMany(ownChildren)}>
            ทุกหน่วยชั้นถัดไปของหน่วยเรา ({ownChildren.length.toLocaleString("th-TH")})
          </Button>
          {ownAll.length > ownChildren.length ? (
            <Button type="button" variant="outline" onClick={() => addMany(ownAll)}>
              ทุกหน่วยใต้สังกัดทุกชั้น ({ownAll.length.toLocaleString("th-TH")})
            </Button>
          ) : null}
        </div>
      ) : null}
      <OrgUnitPicker key={key} units={units} name="to_unit_pick" autoSelect={false} onChange={setPicked} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!pickedUnit} onClick={() => pickedUnit && addMany([pickedUnit])}>
          เพิ่มหน่วยนี้
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!pickedUnit || childrenOf(units, picked, 1).length === 0}
          onClick={() => addMany(childrenOf(units, picked, 1))}
        >
          เพิ่มชั้นถัดไปของหน่วยนี้
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!pickedUnit || childrenOf(units, picked, "all").length === 0}
          onClick={() => addMany(childrenOf(units, picked, "all"))}
        >
          เพิ่มทุกชั้นใต้หน่วยนี้
        </Button>
        {central && central.id !== ownUnitId ? (
          <Button type="button" variant="outline" onClick={() => addMany([central])}>
            เพิ่มส่วนกลาง
          </Button>
        ) : null}
      </div>
      {note ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}

export function DraftForm({
  unitId,
  units,
  candidates,
  selfId,
  prefix,
  yearBe,
  doc,
}: {
  unitId: string;
  units: AccessibleOrgUnit[];
  candidates: Candidate[];
  selfId: string;
  prefix: string;
  yearBe: number;
  doc?: DraftInitial;
}) {
  const { error, setError, flash, pending, run, router } = useRun();
  const issued = doc?.status === "issued";
  const [kind, setKind] = useState<string>(doc?.kind ?? "external");
  const [urgency, setUrgency] = useState(doc?.urgency ?? "normal");
  const [classification, setClassification] = useState(doc?.classification ?? "normal");
  const [viewers, setViewersState] = useState<string[]>(doc?.viewers ?? []);
  const [toUnits, setToUnits] = useState(doc?.toUnits ?? []);
  const [replyRequired, setReplyRequired] = useState(doc?.replyRequired ?? false);
  const k = kind as DocKind;
  // หนังสือที่ออกเลขแล้วเปลี่ยนชนิดได้เฉพาะภายในชุดเลขเดียวกัน (ภายนอก <-> ภายใน)
  const kinds: readonly DocKind[] = issued
    ? doc && (doc.kind === "external" || doc.kind === "internal")
      ? ["external", "internal"]
      : [doc!.kind]
    : DOC_KINDS;
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="draft-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (replyRequired && f.get("reply_due_on_incomplete")) return setError("กรุณากรอกวันที่ต้องตอบกลับให้ครบ");
        const input = {
          replyRequired,
          replyDueOn: fd(f, "reply_due_on"),
          kind,
          toText: fd(f, "to_text"),
          toUnits: toUnits.map((u) => u.id),
          subject: fd(f, "subject"),
          urgency,
          classification,
          salutation: fd(f, "salutation"),
          body: fd(f, "body"),
          closing: fd(f, "closing"),
          signerName: fd(f, "signer_name"),
          signerPosition: fd(f, "signer_position"),
          note: fd(f, "note"),
          viewers,
        };
        run(() => saveDraft(doc?.id ?? null, doc ? null : unitId, input), (r) => router.push(`/app/docs/${doc?.id ?? r.id}`));
      }}
    >
      <ChoiceRow kind={kind} setKind={setKind} urgency={urgency} setUrgency={setUrgency} classification={classification} setClassification={setClassification} kinds={kinds} />
      {!issued ? (
        <p className="text-sm text-muted-foreground" data-testid="no-example">
          เลขที่หนังสือจะออกเมื่อกด ออกเลข ในหน้าหนังสือ รูปแบบ: ที่ {docNoExample(k, prefix, yearBe)}
        </p>
      ) : null}
      <Field label="เรื่อง" name="subject" id="subject" defaultValue={doc?.subject} required maxLength={500} />
      {needsRecipient(k) ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="flex flex-col gap-1">
              <Label htmlFor="salutation">คำขึ้นต้น</Label>
              <Input id="salutation" name="salutation" list="salutation-hints" defaultValue={doc?.salutation ?? "เรียน"} maxLength={100} />
              <datalist id="salutation-hints">
                {SALUTATION_HINTS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <Field label="ถึง (ผู้รับ)" name="to_text" id="to-text" defaultValue={doc?.toText} maxLength={300} hint="ต้องกรอกก่อนออกเลข" />
          </div>
          <UnitListPicker units={units} value={toUnits} onChange={setToUnits} ownUnitId={unitId} />
          <fieldset className="flex flex-col gap-2 rounded-lg border p-3" data-testid="reply-box">
            <legend className="px-1 font-medium">แบบตอบกลับ</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={replyRequired} onChange={(e) => setReplyRequired(e.target.checked)} />
              ต้องการคำตอบจากหน่วยที่ส่งถึง (ตอบในระบบ เป็นข้อความและไฟล์แนบ)
            </label>
            {replyRequired ? (
              <ThaiDateInput label="ตอบภายในวันที่" name="reply_due_on" defaultValue={doc?.replyDueOn ?? undefined} hint="เว้นว่าง = ไม่กำหนดวัน" className="sm:max-w-md" />
            ) : null}
          </fieldset>
        </>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="body">เนื้อความ</Label>
        <textarea id="body" name="body" defaultValue={doc?.body} maxLength={20000} className={`${textareaClass} min-h-64`} />
        <p className="text-sm text-muted-foreground">ขึ้นย่อหน้าใหม่ด้วยการกด Enter หน้าพิมพ์จะย่อหน้าให้เอง</p>
      </div>
      {needsRecipient(k) ? (
        <div className="flex flex-col gap-1 sm:max-w-sm">
          <Label htmlFor="closing">คำลงท้าย</Label>
          <Input id="closing" name="closing" list="closing-hints" defaultValue={doc?.closing ?? "ขอแสดงความนับถือ"} maxLength={100} />
          <datalist id="closing-hints">
            {CLOSING_HINTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ผู้ลงนาม (ชื่อในวงเล็บ)" name="signer_name" id="signer-name" defaultValue={doc?.signerName} maxLength={200} />
        <Field label="ตำแหน่งผู้ลงนาม" name="signer_position" id="signer-position" defaultValue={doc?.signerPosition} maxLength={300} />
      </div>
      {classification !== "normal" ? (
        <ViewerChecks candidates={candidates} value={viewers} onChange={setViewersState} selfId={selfId} />
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">หมายเหตุภายในหน่วย (ไม่พิมพ์ลงหนังสือ)</Label>
        <textarea id="note" name="note" defaultValue={doc?.note} maxLength={1000} className={textareaClass} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {doc ? "บันทึก" : "บันทึกร่าง"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// ปุ่มดำเนินการในหน้าหนังสือ
// ---------------------------------------------------------------
export function IssueForm({ id, kind, prefix, yearBe }: { id: string; kind: DocKind; prefix: string; yearBe: number }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="issue-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("issue_date_incomplete")) return setError("กรุณากรอกวันที่ของหนังสือให้ครบ");
        if (!window.confirm("ออกเลขแล้วยกเลิกได้แต่เลขจะไม่ถูกนำกลับมาใช้ ยืนยันออกเลข?")) return;
        run(() => issueNumber(id, fd(f, "issue_date")));
      }}
    >
      <p>
        เลขถัดไปตามรูปแบบ: <span className="font-semibold">ที่ {docNoExample(kind, prefix, yearBe)}</span>
      </p>
      <ThaiDateInput label="ลงวันที่" name="issue_date" defaultValue={todayIso()} required className="sm:max-w-md" />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          ออกเลขที่หนังสือ
        </Button>
      </div>
    </form>
  );
}

export function SendButton({ id, unitCount }: { id: string; unitCount: number }) {
  const { error, flash, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2" data-testid="send-box">
      <p className="text-sm text-muted-foreground">
        {unitCount > 0
          ? `เมื่อกดส่ง หน่วยในระบบ ${unitCount} หน่วยจะได้รายการรอลงรับ หลังส่งแล้วแก้ไขไม่ได้`
          : "บันทึกว่าส่งแล้ว (ผู้รับภายนอก ส่งตามช่องทางปกติ) หลังส่งแล้วแก้ไขไม่ได้"}
      </p>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="button" disabled={pending} onClick={() => window.confirm("ยืนยันส่งหนังสือ?") && run(() => sendDocument(id))}>
          ส่งหนังสือ
        </Button>
      </div>
    </div>
  );
}

export function CancelForm({ id, label }: { id: string; label: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="cancel-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => cancelDocument(id, fd(f, "reason")));
      }}
    >
      <Field label="เหตุผลที่ยกเลิก" name="reason" id="cancel-reason" required maxLength={500} hint="เลขที่ยกเลิกจะคงอยู่ในทะเบียน ไม่ถูกนำกลับมาใช้" />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" className="border-destructive text-destructive" disabled={pending}>
          {label}
        </Button>
      </div>
    </form>
  );
}

export function DiscardButton({ id }: { id: string }) {
  const { error, flash, pending, run, router } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Messages error={error} flash={flash} />
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => window.confirm("ทิ้งร่างนี้?") && run(() => discardDraft(id), () => router.push("/app/docs?tab=draft"))}
        >
          ทิ้งร่าง
        </Button>
      </div>
    </div>
  );
}

export function ViewersForm({ id, candidates, current, selfId }: { id: string; candidates: Candidate[]; current: string[]; selfId: string }) {
  const { error, flash, pending, run } = useRun();
  const [value, setValue] = useState<string[]>(current);
  return (
    <div className="flex flex-col gap-2" data-testid="viewers-form">
      <ViewerChecks candidates={candidates} value={value} onChange={setValue} selfId={selfId} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setViewers(id, value))}>
          บันทึกรายชื่อ
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// ค่าตั้งหัวหนังสือ
// ---------------------------------------------------------------
export function LetterheadForm({
  unitId,
  initial,
}: {
  unitId: string;
  initial: { code_prefix: string; agency_name: string; address: string } | null;
}) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="letterhead-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => saveLetterhead(unitId, { codePrefix: fd(f, "code_prefix"), agencyName: fd(f, "agency_name"), address: fd(f, "address") }));
      }}
    >
      <Field
        label="รหัสหนังสือของหน่วย"
        name="code_prefix"
        id="code-prefix"
        defaultValue={initial?.code_prefix}
        maxLength={40}
        hint="รหัสพยัญชนะและเลขประจำหน่วย เช่น พศ 0001 ระบบต่อท้ายด้วย /ลำดับ (หนังสือเวียน /ว ลำดับ) ต้องตั้งก่อนออกเลขหนังสือภายนอก ภายใน และหนังสือเวียน"
      />
      <Field
        label="ชื่อส่วนงานบนหัวหนังสือ"
        name="agency_name"
        id="agency-name"
        defaultValue={initial?.agency_name}
        maxLength={200}
        hint="ว่าง = ใช้ชื่อหน่วยในระบบ"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="address">ที่ตั้ง (พิมพ์มุมขวาของหนังสือภายนอก)</Label>
        <textarea id="address" name="address" defaultValue={initial?.address} maxLength={500} className={textareaClass} />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          บันทึกหัวหนังสือ
        </Button>
      </div>
    </form>
  );
}
