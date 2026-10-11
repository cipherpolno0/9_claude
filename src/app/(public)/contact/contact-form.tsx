"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";

import { ErrorText, Field, InfoText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { sendContactMessage } from "./actions";

const textareaClass =
  "min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** แบบฟอร์มส่งข้อความ (เลือกหัวข้อตามระบบ ข้อความเข้ากล่องของผู้รับผิดชอบหัวข้อนั้น) */
export function ContactForm({ topics }: { topics: { key: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // เวลาที่เริ่มกรอก (กันบอทที่ส่งทันที) ตั้งเมื่อผู้ใช้เริ่มพิมพ์ครั้งแรก
  const startedAt = useRef<number>(0);
  // ลิงก์ /contact?topic=privacy (จากหน้านโยบายความเป็นส่วนตัว) เลือกหัวข้อให้ล่วงหน้า หน้านี้เป็นหน้าคงที่จึงอ่านจากที่อยู่ในเบราว์เซอร์
  const topicRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("topic");
    if (t && topicRef.current && topics.some((x) => x.key === t)) topicRef.current.value = t;
  }, [topics, sent]);
  const markStart = () => {
    if (!startedAt.current) startedAt.current = Date.now();
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-3" data-testid="contact-sent">
        <InfoText>{sent}</InfoText>
        <div>
          <Button type="button" variant="outline" onClick={() => setSent(null)}>
            ส่งข้อความอื่น
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="contact-form"
      onFocus={markStart}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("started_at", String(startedAt.current || Date.now()));
        startTransition(async () => {
          const r = await sendContactMessage(fd);
          if (r.ok) {
            form.reset();
            startedAt.current = 0;
            setSent(r.message ?? "ส่งข้อความแล้ว");
          } else setError(r.error ?? "ส่งไม่สำเร็จ");
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="contact-topic">
          หัวข้อ<span className="text-destructive"> *</span>
        </Label>
        <select ref={topicRef} id="contact-topic" name="topic" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            เลือกหัวข้อที่ต้องการติดต่อ
          </option>
          {topics.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <Field label="ชื่อ" name="name" id="contact-name" required maxLength={200} autoComplete="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="อีเมล" name="email" id="contact-email" type="email" maxLength={200} autoComplete="email" />
        <Field label="เบอร์โทรศัพท์" name="phone" id="contact-phone" type="tel" maxLength={30} autoComplete="tel" />
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">กรอกอีเมลหรือเบอร์โทรศัพท์อย่างน้อย 1 ช่อง เพื่อให้เจ้าหน้าที่ติดต่อกลับ</p>
      <Field label="เรื่อง" name="subject" id="contact-subject" required maxLength={300} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="contact-message">
          ข้อความ<span className="text-destructive"> *</span>
        </Label>
        <textarea id="contact-message" name="message" required minLength={10} maxLength={5000} className={textareaClass} />
        <p className="text-sm text-muted-foreground">
          ไม่ต้องใส่เลขประจำตัวประชาชนหรือข้อมูลส่วนตัวที่ไม่จำเป็น (ข้อความเห็นเฉพาะเจ้าหน้าที่ผู้รับผิดชอบหัวข้อนี้)
        </p>
      </div>
      {/* ช่องดักบอท: ซ่อนจากผู้ใช้และโปรแกรมอ่านหน้าจอ คนทั่วไปจะไม่กรอก */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">เว็บไซต์</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div aria-live="polite">
        <ErrorText>{error}</ErrorText>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          <Send aria-hidden />
          {pending ? "กำลังส่ง..." : "ส่งข้อความ"}
        </Button>
      </div>
    </form>
  );
}
