"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { publishDrafts } from "../actions";

const n = (value: number) => value.toLocaleString("th-TH");

/** ปุ่ม "เผยแพร่ร่างทั้งหมดตามตัวกรอง": นับให้ดูก่อน แล้วจึงยืนยัน */
export function PublishDraftsButton({ q, filters }: { q: string; filters: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = Boolean(q) || Object.keys(filters).some((k) => k !== "status");

  const start = () => {
    setOpen(true);
    setCount(null);
    setDone(null);
    setError(null);
    startTransition(async () => {
      const result = await publishDrafts({ q, filters }, true);
      if (result.ok) setCount(result.count);
      else setError(result.error);
    });
  };
  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const result = await publishDrafts({ q, filters }, false);
      if (result.ok) {
        setDone(result.count);
        router.refresh();
      } else setError(result.error);
    });

  return (
    <>
      <Button type="button" variant="outline" onClick={start}>
        <Send aria-hidden />
        เผยแพร่ร่างทั้งหมดตามตัวกรอง
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="publish-dialog">
          <DialogHeader>
            <DialogTitle>เผยแพร่ข้อสอบฉบับร่าง</DialogTitle>
            <DialogDescription>
              {filtered
                ? "เผยแพร่ข้อสอบฉบับร่างทุกข้อที่ตรงกับคำค้นและตัวกรองที่เลือกอยู่ในหน้านี้"
                : "ยังไม่ได้เลือกตัวกรอง ระบบจะเผยแพร่ข้อสอบฉบับร่างทุกข้อในคลัง"}{" "}
              ควรเปิดดูตัวอย่างของข้อสอบก่อนเผยแพร่ และถอนกลับเป็นร่างได้ทีละข้อภายหลัง
            </DialogDescription>
          </DialogHeader>
          <ErrorText>{error}</ErrorText>
          {pending && count === null && done === null ? <p className="text-muted-foreground">กำลังนับข้อสอบฉบับร่าง...</p> : null}
          {done !== null ? (
            <InfoText>เผยแพร่แล้ว {n(done)} ข้อ</InfoText>
          ) : count !== null ? (
            <p data-testid="publish-count">
              {count > 0 ? (
                <>
                  จะเผยแพร่ข้อสอบฉบับร่าง <strong>{n(count)} ข้อ</strong>
                </>
              ) : (
                "ไม่มีข้อสอบฉบับร่างที่ตรงกับตัวกรองนี้"
              )}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {done !== null ? "ปิด" : "ยกเลิก"}
            </Button>
            {done === null ? (
              <Button type="button" onClick={confirm} disabled={pending || !count}>
                {pending && count !== null ? "กำลังเผยแพร่..." : "ยืนยันเผยแพร่"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
