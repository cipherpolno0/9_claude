"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { copyVenueOfficers, type CopyResult } from "./actions";

const n = (value: number) => value.toLocaleString("th-TH");

/** ปุ่ม "คัดลอกจากปีก่อน": นับให้ดูก่อน แล้วจึงยืนยันคัดลอกรายชื่อประธานและผู้รับข้อสอบมาปีที่เลือก */
export function CopyOfficersButton({ yearId, yearBe, unitId }: { yearId: string; yearBe: number; unitId: string | null }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CopyResult | null>(null);
  const [done, setDone] = useState<CopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setOpen(true);
    setPreview(null);
    setDone(null);
    setError(null);
    startTransition(async () => {
      const result = await copyVenueOfficers(yearId, unitId, true);
      if (result.ok) setPreview(result.result);
      else setError(result.error);
    });
  };
  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const result = await copyVenueOfficers(yearId, unitId, false);
      if (result.ok) setDone(result.result);
      else setError(result.error);
    });

  return (
    <>
      <Button type="button" variant="outline" onClick={start}>
        <Copy aria-hidden />
        คัดลอกจากปีก่อน
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="copy-dialog">
          <DialogHeader>
            <DialogTitle>คัดลอกรายชื่อจากปีก่อน มาปีการศึกษา {yearBe}</DialogTitle>
            <DialogDescription>
              ยกรายชื่อประธานสนามสอบและผู้รับข้อสอบ พร้อมที่อยู่จัดส่งและเบอร์ติดต่อ ของสนามที่เปิดอยู่
              {unitId ? "ในเขตที่กรองอยู่" : "ในเขตที่ท่านแก้ไขได้"} แล้วแก้เฉพาะสนามที่เปลี่ยนตัวบุคคล
            </DialogDescription>
          </DialogHeader>
          <ErrorText>{error}</ErrorText>
          {pending && !preview && !done ? <p className="text-muted-foreground">กำลังตรวจรายชื่อของปีก่อน...</p> : null}
          {done ? (
            <InfoText>
              คัดลอกจากปีการศึกษา {done.fromYear} แล้ว {n(done.copied)} รายการ
              {done.skippedFilled > 0 ? ` · ข้าม ${n(done.skippedFilled)} รายการที่ปี ${yearBe} มีรายชื่ออยู่แล้ว` : ""}
              {done.skippedPerson > 0 ? ` · ข้าม ${n(done.skippedPerson)} รายการที่บุคคลไม่ได้ปฏิบัติหน้าที่แล้ว` : ""}
            </InfoText>
          ) : preview ? (
            <ul className="list-disc pl-6" data-testid="copy-preview">
              <li>
                จะคัดลอกจากปีการศึกษา {preview.fromYear}: <strong>{n(preview.copied)} รายการ</strong>
              </li>
              <li>ข้าม {n(preview.skippedFilled)} รายการ เพราะปี {yearBe} มีรายชื่อในบทบาทนั้นอยู่แล้ว (ไม่เขียนทับ)</li>
              <li>
                ข้าม {n(preview.skippedPerson)} รายการ เพราะบุคคลไม่ได้ปฏิบัติหน้าที่แล้ว (ย้ายแล้ว ลาออก มรณภาพ ลาสิกขา
                หรือพ้นตำแหน่ง) ต้องเลือกคนใหม่เอง
              </li>
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {done ? "ปิด" : "ยกเลิก"}
            </Button>
            {!done ? (
              <Button type="button" onClick={confirm} disabled={pending || !preview || preview.copied === 0}>
                {pending && preview ? "กำลังคัดลอก..." : "ยืนยันคัดลอก"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
