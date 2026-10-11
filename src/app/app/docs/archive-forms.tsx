"use client";

import { useState, useTransition } from "react";

import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_KIND_LABEL, docRefLabel, type DocKind, type LinkCandidate } from "@/lib/docs";
import { thaiDate } from "@/lib/thai";

import {
  closeDocument,
  linkDocumentToRequest,
  linkRequestByNo,
  reopenDocument,
  saveRetention,
  searchLinkCandidates,
  unlinkRequest,
} from "./actions";
import { Messages, useRun } from "./doc-forms";

const fd = (f: FormData, k: string) => String(f.get(k) ?? "");

/** ปิดเรื่อง (ย้ายเข้าคลังเก็บ) */
export function CloseForm({ id, openWork }: { id: string; openWork: number }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="close-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => closeDocument(id, fd(f, "note")));
      }}
    >
      {openWork > 0 ? (
        <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-950">
          ยังมีงานที่เสนอหรือมอบหมายค้างอยู่ {openWork} รายการ ต้องให้ผู้รับรายงานผล (หรือยกเลิก) ก่อนจึงปิดเรื่องได้
        </p>
      ) : null}
      <Field label="บันทึกการปิดเรื่อง (ไม่บังคับ)" name="note" id="close-note" maxLength={1000} hint="เช่น ดำเนินการตามหนังสือครบแล้ว ปิดแล้วหนังสือย้ายไปแท็บ คลังเก็บ" />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          ปิดเรื่อง
        </Button>
      </div>
    </form>
  );
}

/** เปิดเรื่องใหม่ (ต้องมีเหตุผล) */
export function ReopenForm({ id }: { id: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="reopen-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => reopenDocument(id, fd(f, "reason")));
      }}
    >
      <Field label="เหตุผลที่เปิดเรื่องใหม่" name="reason" id="reopen-reason" required maxLength={1000} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          เปิดเรื่องใหม่
        </Button>
      </div>
    </form>
  );
}

/** อ้างอิงคำขอจากหน้าหนังสือ: กรอกเลขที่คำขอ */
export function LinkRequestForm({ docId }: { docId: string }) {
  const { error, flash, pending, run, router } = useRun();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="link-request-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(() => linkRequestByNo(docId, fd(f, "request_no")), () => {
          form.reset();
          router.refresh();
        });
      }}
    >
      <Field
        label="เลขที่คำขอ"
        name="request_no"
        id="link-request-no"
        required
        maxLength={40}
        placeholder="เช่น ESTAB-2569-0001"
        hint="คำขอของบุคลากร ทะเบียนสถานที่ งบประมาณ และพัสดุ ที่ท่านเห็นได้"
      />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          อ้างอิงคำขอ
        </Button>
      </div>
    </form>
  );
}

export function UnlinkButton({ linkId, label = "ยกเลิกการอ้างอิง" }: { linkId: string; label?: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid="unlink"
        onClick={() => window.confirm("ยกเลิกการอ้างอิงนี้?") && run(() => unlinkRequest(linkId))}
      >
        {label}
      </Button>
      <Messages error={error} flash={flash} />
    </span>
  );
}

/** อ้างอิงหนังสือจากหน้าคำขอ: ค้นจากเลขที่ เลขรับ (เช่น 12/2569) หรือเรื่อง แล้วกดเลือก */
export function LinkDocumentPicker({ requestId }: { requestId: string }) {
  const { error, flash, pending, run, router } = useRun();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LinkCandidate[] | null>(null);
  const [searching, startSearch] = useTransition();
  const search = () => {
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    startSearch(async () => setRows(await searchLinkCandidates(requestId, q)));
  };
  return (
    <div className="flex flex-col gap-2" data-testid="link-doc-picker">
      <Label htmlFor="link-doc-q">ค้นหนังสือที่จะอ้างอิง</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="link-doc-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="เลขที่หนังสือ เลขรับ (เช่น 12/2569) หรือเรื่อง"
          className="min-w-0 flex-1"
          maxLength={100}
        />
        <Button type="button" variant="outline" onClick={search} disabled={searching}>
          ค้นหา
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">ค้นจากหนังสือที่มีเลขแล้วของหน่วยที่ท่านดูสารบรรณได้ (อย่างน้อย 2 ตัวอักษร)</p>
      {rows !== null ? (
        rows.length ? (
          <ul className="flex flex-col gap-2" data-testid="link-candidates">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <span className="min-w-0">
                  <span className="font-semibold">{docRefLabel(r)}</span> · {r.subject}
                  <span className="block text-sm text-muted-foreground">
                    {r.unit_name} · {r.direction === "receive" ? "หนังสือรับ" : "หนังสือส่ง"} · ลงวันที่ {thaiDate(r.doc_date, "short")}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => linkDocumentToRequest(requestId, r.id), () => {
                    setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
                    router.refresh();
                  })}
                >
                  อ้างอิง
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground" data-testid="link-candidates-empty">
            ไม่พบหนังสือที่ตรงกัน
          </p>
        )
      ) : null}
      <Messages error={error} flash={flash} />
    </div>
  );
}

/** อายุการเก็บของชนิดหนังสือหนึ่งชนิด (ผู้ดูแลระบบ) */
export function RetentionForm({ kind, years, note }: { kind: DocKind; years: number | null; note: string }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_8rem_2fr_auto] sm:items-end"
      data-testid={`retention-${kind}`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => saveRetention(kind, fd(f, "years"), fd(f, "note")));
      }}
    >
      <p className="font-semibold sm:pb-3">{DOC_KIND_LABEL[kind]}</p>
      <Field
        label="อายุการเก็บ (ปี)"
        name="years"
        id={`ret-${kind}-years`}
        type="number"
        min={1}
        max={100}
        defaultValue={years ?? ""}
        placeholder="ไม่กำหนด"
      />
      <Field label="อ้างอิงระเบียบ / หมายเหตุ" name="note" id={`ret-${kind}-note`} maxLength={500} defaultValue={note} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          บันทึก
        </Button>
      </div>
      <div className="sm:col-span-4">
        <Messages error={error} flash={flash} />
      </div>
    </form>
  );
}
