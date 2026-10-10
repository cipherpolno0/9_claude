"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht } from "@/lib/budget";

import { closeFiscalYear } from "../../actions";

type Candidate = {
  id: string;
  unit_name: string;
  item_path: string;
  request_no: string;
  purpose: string;
  committed: number;
  disbursed: number;
  outstanding: number;
};

/** เลือกคำขอที่ยกยอดไปปีถัดไป แล้วยืนยันปิดสิ้นปี */
export function CloseYearForm({
  yearId,
  yearBe,
  canCarry,
  blocked,
  candidates,
  totalOutstanding,
}: {
  yearId: string;
  yearBe: number;
  canCarry: boolean;
  blocked: boolean;
  candidates: Candidate[];
  totalOutstanding: number;
}) {
  const router = useRouter();
  const [carry, setCarry] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const carried = candidates.filter((c) => carry.includes(c.id)).reduce((a, c) => a + Math.round(c.outstanding * 100), 0) / 100;

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="close-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await closeFiscalYear(yearId, carry, note);
          if (r.ok) {
            setFlash(r.message ?? null);
            router.push(`/app/budget/settings/close?year=${yearBe}&saved=${encodeURIComponent(r.message ?? "")}`);
          } else setError(r.error);
        });
      }}
    >
      <h2 className="text-xl font-bold text-primary">คำขอที่ยังมียอดค้างเบิก ({candidates.length.toLocaleString("th-TH")} รายการ รวม {baht(totalOutstanding)} บาท)</h2>
      {candidates.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-muted-foreground">ไม่มีคำขอที่ค้างเบิก</p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] border-collapse text-left" data-testid="close-candidates">
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2">ยกไปปี {yearBe + 1}</th>
                <th scope="col" className="px-3 py-2">คำขอ</th>
                <th scope="col" className="px-3 py-2">หน่วย / รายการ</th>
                <th scope="col" className="px-3 py-2 text-right">ผูกพัน</th>
                <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย</th>
                <th scope="col" className="px-3 py-2 text-right">ค้างเบิก</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={`ยกยอด ${c.request_no || c.purpose} ไปปีถัดไป`}
                      disabled={!canCarry}
                      checked={carry.includes(c.id)}
                      onChange={(e) => setCarry((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {c.request_no || "-"}
                    <span className="block text-sm text-muted-foreground">{c.purpose}</span>
                  </td>
                  <td className="px-3 py-2">
                    {c.unit_name}
                    <span className="block text-sm text-muted-foreground">{c.item_path}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(c.committed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(c.disbursed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(c.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p data-testid="close-preview">
        ยกยอดไปปีถัดไป {baht(carried)} บาท · คืนเงินเหลือจ่ายอัตโนมัติ {baht(Math.round((totalOutstanding - carried) * 100) / 100)} บาท
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="close-note">หมายเหตุการปิดปี</Label>
        <Input id="close-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        เข้าใจแล้วว่าปิดสิ้นปีงบประมาณ {yearBe} แล้วเปิดอีกไม่ได้
      </label>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending || blocked || !confirm}>
          {pending ? "กำลังปิดปี..." : `ยืนยันปิดสิ้นปีงบประมาณ ${yearBe}`}
        </Button>
      </div>
    </form>
  );
}
