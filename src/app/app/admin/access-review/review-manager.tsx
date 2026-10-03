"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { decideReview, openReview } from "./actions";

export type Round = { id: string; year_be: number; opened_at: string; due_on: string; closed_at: string | null };
export type ReviewRow = {
  user_id: string;
  full_name: string;
  email: string;
  roles_text: string | null;
  last_seen_at: string | null;
  decision: "keep" | "suspend" | null;
  decided_at: string | null;
};

const thaiDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "-";

export function ReviewManager({
  isAdmin,
  current,
  history,
  rows,
  defaultYearBe,
  maintenance,
}: {
  isAdmin: boolean;
  current: Round | null;
  history: Round[];
  rows: ReviewRow[];
  defaultYearBe: number;
  maintenance: { suspended: number; rounds_closed: number } | null;
}) {
  const [yearBe, setYearBe] = useState(String(defaultYearBe));
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });

  const decided = rows.filter((r) => r.decision).length;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {maintenance && (maintenance.suspended > 0 || maintenance.rounds_closed > 0) ? (
        <InfoText>
          ระบบระงับบัญชีที่เข้าเกณฑ์ {maintenance.suspended} บัญชี และปิดรอบที่ครบกำหนด {maintenance.rounds_closed} รอบ
        </InfoText>
      ) : null}
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>

      {current ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">รอบทบทวนประจำปี พ.ศ. {current.year_be}</h2>
          <p className="mt-1">
            เปิดเมื่อ {thaiDate(current.opened_at)} · ยืนยันได้ถึงวันที่ <strong>{thaiDate(current.due_on)}</strong>
          </p>
          <p className="text-muted-foreground" data-testid="review-progress">
            ยืนยันแล้ว {decided} จาก {rows.length} บัญชี
          </p>

          {rows.length === 0 ? (
            <p className="mt-4 text-muted-foreground">ไม่มีบัญชีที่ท่านต้องยืนยันในรอบนี้</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2" data-testid="review-list">
              {rows.map((r) => (
                <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.full_name}</p>
                    <p className="text-muted-foreground">
                      {r.email} · {r.roles_text ?? "ไม่มีบทบาท"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      เข้าใช้ล่าสุด {r.last_seen_at ? thaiDate(r.last_seen_at) : "ยังไม่เคยเข้าใช้"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.decision ? (
                      <span
                        className={cn(
                          "rounded border px-2 py-0.5 text-sm font-semibold",
                          r.decision === "suspend" ? "border-destructive text-destructive" : "border-input",
                        )}
                      >
                        {r.decision === "keep" ? "คงไว้" : "ระงับแล้ว"}
                      </span>
                    ) : null}
                    {r.decision !== "keep" && r.decision !== "suspend" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={pending}
                          aria-label={`คงไว้ ${r.full_name}`}
                          onClick={() => run(() => decideReview({ roundId: current.id, userId: r.user_id, decision: "keep" }))}
                        >
                          คงไว้
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          aria-label={`ระงับ ${r.full_name}`}
                          onClick={() => run(() => decideReview({ roundId: current.id, userId: r.user_id, decision: "suspend" }))}
                        >
                          ระงับ
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">ขณะนี้ไม่มีรอบทบทวนที่เปิดอยู่</h2>
          {isAdmin ? (
            <form
              className="mt-3 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => openReview(Number(yearBe)));
              }}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="year-be">ประจำปี พ.ศ.</Label>
                <Input id="year-be" type="number" min={2500} max={2700} value={yearBe} onChange={(e) => setYearBe(e.target.value)} className="w-32" required />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "กำลังเปิดรอบ..." : "เปิดรอบทบทวนประจำปี"}
              </Button>
            </form>
          ) : (
            <p className="mt-1 text-muted-foreground">ผู้ดูแลระบบเป็นผู้เปิดรอบทบทวนปีละครั้ง</p>
          )}
        </div>
      )}

      {history.length > 0 ? (
        <div>
          <h2 className="text-lg font-bold text-primary">รอบที่ผ่านมา</h2>
          <ul className="mt-2 list-disc pl-6">
            {history.map((r) => (
              <li key={r.id}>
                พ.ศ. {r.year_be} · เปิด {thaiDate(r.opened_at)} · ครบกำหนด {thaiDate(r.due_on)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
