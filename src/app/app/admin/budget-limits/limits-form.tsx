"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveApprovalLimits } from "./actions";

export type LimitCell = { id: string; level: string; levelLabel: string; role: string; roleLabel: string; amount: string };

/** ตารางวงเงิน: แถว = ชั้น คอลัมน์ = ตำแหน่ง */
export function LimitsForm({ cells, levels, roles }: { cells: LimitCell[]; levels: { key: string; label: string }[]; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(cells.map((c) => [c.id, c.amount])));
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cellOf = (level: string, role: string) => cells.find((c) => c.level === level && c.role === role);

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      data-testid="limits-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        startTransition(async () => {
          const r = await saveApprovalLimits(cells.map((c) => ({ id: c.id, amount: values[c.id] ?? "" })));
          if (r.ok) {
            setFlash(r.message ?? null);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div className="relative overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <caption className="sr-only">วงเงินอนุมัติคำขอใช้งบประมาณ (บาท)</caption>
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2">ชั้น</th>
              {roles.map((r) => (
                <th key={r.key} scope="col" className="px-3 py-2">
                  {r.label} (บาท)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.key} className="border-t">
                <th scope="row" className="px-3 py-2 font-semibold">
                  {l.label}
                </th>
                {roles.map((r) => {
                  const c = cellOf(l.key, r.key);
                  return (
                    <td key={r.key} className="px-3 py-2">
                      {c ? (
                        <Input
                          aria-label={`วงเงินของ${r.label}ชั้น${l.label}`}
                          inputMode="decimal"
                          placeholder="ว่าง = ส่งต่อ"
                          value={values[c.id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t text-muted-foreground">
              <th scope="row" className="px-3 py-2 font-semibold">
                ส่วนกลาง
              </th>
              <td className="px-3 py-2" colSpan={roles.length}>
                เจ้าหน้าที่ส่วนกลางอนุมัติได้ไม่จำกัดวงเงิน (ชั้นสุดท้ายของทุกคำขอที่ไม่มีชั้นใดมีวงเงินพอ)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกวงเงิน"}
        </Button>
      </div>
    </form>
  );
}
