"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";

import { ErrorText } from "@/components/form";
import { SearchPicker, type PickerItem } from "@/components/search-picker";
import { Button } from "@/components/ui/button";
import { examName } from "@/lib/exam-forms";
import type { RegisterRound } from "@/lib/exam-forms-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";
import { todayInBangkok } from "@/lib/venues";

import { uploadRegistration } from "../batches/actions";
import { checkRegisterTemplate, searchRegisterPlaces, searchRegisterVenues } from "./actions";

function Step({ no, title, done, children }: { no: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5" data-testid={`step-${no}`}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full text-base",
            done ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
          aria-hidden
        >
          {no}
        </span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * สมัครสอบ 3 ขั้น: รอบ > สำนักหรือสถานศึกษา > สนามสอบ
 * mode="download" ดาวน์โหลดแม่แบบ (บทที่ 17) / mode="upload" อัปโหลดไฟล์ที่กรอกแล้วเพื่อตรวจ (บทที่ 18)
 */
export function RegisterWizard({
  rounds,
  mode = "download",
  limits,
}: {
  rounds: RegisterRound[];
  mode?: "download" | "upload";
  limits?: { maxMb: number; maxRows: number };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [roundId, setRoundId] = useState<string>(rounds.find((r) => r.accepting)?.id ?? "");
  const [place, setPlace] = useState<PickerItem | null>(null);
  const [venue, setVenue] = useState<PickerItem | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const round = rounds.find((r) => r.id === roundId) ?? null;

  const pickRound = (id: string) => {
    setRoundId(id);
    setPlace(null);
    setVenue(null);
    setWarnings([]);
    setError(null);
    setDetails([]);
  };

  const upload = () =>
    startTransition(async () => {
      setError(null);
      setDetails([]);
      const file = fileRef.current?.files?.[0];
      if (!round || !place || !venue) return;
      if (!file) {
        setError("กรุณาเลือกไฟล์ Excel ที่กรอกแล้ว");
        return;
      }
      if (limits && file.size > limits.maxMb * 1024 * 1024) {
        setError(`ไฟล์ใหญ่เกิน ${limits.maxMb} MB`);
        return;
      }
      const formData = new FormData();
      formData.set("round", round.id);
      formData.set("place", place.id);
      formData.set("venue", venue.id);
      formData.set("file", file);
      const result = await uploadRegistration(formData);
      if (!result.ok) {
        setError(result.error);
        setDetails(result.details ?? []);
        return;
      }
      router.push(`/app/exams/batches/${result.id}`);
    });

  const download = () =>
    startTransition(async () => {
      setError(null);
      if (!round || !place || !venue) return;
      const check = await checkRegisterTemplate(round.id, place.id, venue.id);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setWarnings(check.warnings);
      const query = new URLSearchParams({ round: round.id, place: place.id, venue: venue.id });
      // ดาวน์โหลดไฟล์ (ไม่ใช่การเปลี่ยนหน้า) จึงใช้ลิงก์ชั่วคราว
      const link = document.createElement("a");
      link.href = `/app/exams/register/template?${query.toString()}`;
      link.click();
    });

  if (rounds.length === 0) {
    return (
      <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="no-rounds">
        ขณะนี้ยังไม่มีรอบที่เปิดรับสมัคร กรุณาติดตามประกาศจากส่วนกลาง
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Step no={1} title="เลือกรอบสมัครสอบ" done={Boolean(round)}>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">รอบสมัครสอบ</legend>
          {rounds.map((r) => (
            <label
              key={r.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                r.id === roundId && "border-primary bg-secondary",
                !r.accepting && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="round"
                className="mt-1 size-5"
                value={r.id}
                checked={r.id === roundId}
                disabled={!r.accepting}
                onChange={() => pickRound(r.id)}
              />
              <span>
                <span className="font-semibold">
                  {examName(r.exam_type, r.level)} ปีการศึกษา {r.year_be}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">{r.form_code ? `แบบ ${r.form_code}` : ""}</span>
                <span className="block text-sm">
                  รับสมัคร {thaiDate(r.opens_on, "short")} – {thaiDate(r.closes_on, "short")}
                  {r.accepting ? "" : r.opens_on > todayInBangkok() ? " (ยังไม่ถึงวันเปิดรับสมัคร)" : " (พ้นวันปิดรับสมัครแล้ว)"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </Step>

      <Step no={2} title="เลือกสำนักหรือสถานศึกษาของท่าน" done={Boolean(place)}>
        {round ? (
          <SearchPicker
            key={`place-${round.id}`}
            name="place_id"
            label={round.exam_type === "nak_tham" ? "สำนักเรียน หรือ สำนักศาสนศึกษา" : "สำนัก วัด สถานศึกษา หรือองค์กร"}
            placeholder="พิมพ์ชื่อหรือรหัสอย่างน้อย 2 ตัวอักษร"
            search={(q) => searchRegisterPlaces(round.id, q)}
            onPick={(item) => {
              setPlace(item);
              setWarnings([]);
            }}
            required
            hint="แสดงเฉพาะที่อยู่ในเขตของท่านและเขตใต้สังกัด และยังเปิดดำเนินการ"
          />
        ) : (
          <p className="text-muted-foreground">เลือกรอบก่อน</p>
        )}
      </Step>

      <Step no={3} title="เลือกสนามสอบ" done={Boolean(venue)}>
        {round ? (
          <SearchPicker
            key={`venue-${round.id}`}
            name="venue_id"
            label="สนามสอบ"
            placeholder="พิมพ์ชื่อสนามสอบ รหัส หรือชื่อวัดที่ตั้ง อย่างน้อย 2 ตัวอักษร"
            search={(q) => searchRegisterVenues(round.id, q)}
            onPick={(item) => {
              setVenue(item);
              setWarnings([]);
            }}
            required
            hint={`แสดงเฉพาะสนามสอบ${examName(round.exam_type, "")}ที่เปิดอยู่และเปิดสอบชั้นนี้`}
          />
        ) : (
          <p className="text-muted-foreground">เลือกรอบก่อน</p>
        )}
      </Step>

      {mode === "upload" ? (
        <Step no={4} title="เลือกไฟล์ที่กรอกแล้ว และอัปโหลดเพื่อตรวจ" done={false}>
          <label htmlFor="registration-file" className="font-medium">
            ไฟล์บัญชี ศ. (.xlsx)
          </label>
          <input
            id="registration-file"
            ref={fileRef}
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1 block w-full rounded-md border bg-background p-2"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            ไม่เกิน {limits?.maxMb ?? 5} MB และไม่เกิน {(limits?.maxRows ?? 2000).toLocaleString("th-TH")} คนต่อไฟล์
            ใช้แม่แบบที่ดาวน์โหลดจากระบบสำหรับรอบ สำนัก และสนามสอบนี้ ห้ามเพิ่ม ลบ หรือย้ายคอลัมน์
          </p>
          <Button type="button" size="lg" className="mt-3" disabled={!round || !place || !venue || pending} onClick={upload}>
            <Upload aria-hidden />
            {pending ? "กำลังอ่านและตรวจไฟล์..." : "อัปโหลดและตรวจ"}
          </Button>
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
          {details.length ? (
            <ul className="mt-2 list-disc pl-6 text-destructive" data-testid="upload-problems">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            ระบบจะตรวจทุกแถวแล้วแสดงตัวอย่างให้ดูก่อน ยังไม่บันทึกเป็นผู้สมัครจนกว่าท่านจะกดยืนยัน ถ้าสำนักนี้มีบัญชีของสนามสอบนี้อยู่แล้ว ไฟล์จะถูกเพิ่มเข้าบัญชีเดิม
          </p>
        </Step>
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <Button type="button" size="lg" disabled={!round || !place || !venue || pending} onClick={download}>
            <Download aria-hidden />
            {pending ? "กำลังตรวจ..." : "ดาวน์โหลดแม่แบบ"}
          </Button>
          <ErrorText>{error}</ErrorText>
          {warnings.length ? (
            <ul className="mt-3 list-disc pl-6 text-amber-900" data-testid="template-warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            แม่แบบมี 2 แผ่นงาน: แผ่นแรกสำหรับกรอกและส่ง (ห้ามรวมชั้น ห้ามรวมสนามสอบ) และแผ่นงาน ตัวอย่าง ที่มีแถวตัวอย่างและคำแนะนำรายคอลัมน์
          </p>
        </div>
      )}
    </div>
  );
}
