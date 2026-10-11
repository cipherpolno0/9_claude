"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, Field, InfoText, selectClass } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DOWNLOAD_CATEGORIES,
  DOWNLOAD_CATEGORY_LABEL,
  SITE_FILE_ACCEPT,
  type AdminAnnouncement,
  type AdminDownload,
  type CalendarEventRow,
} from "@/lib/site-content";

import {
  addTopicRecipient,
  removeTopicRecipient,
  saveAnnouncement,
  saveCalendarEvent,
  saveContactSettings,
  saveDownload,
  setAnnouncementActive,
  setAnnouncementFileActive,
  setCalendarEventActive,
  setDownloadActive,
} from "./site-content-actions";

type Result = { ok: boolean; message?: string; error?: string };

const textareaClass =
  "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setFlash(r.message ?? "บันทึกแล้ว");
        after?.();
        router.refresh();
      } else {
        setError(r.error ?? "บันทึกไม่สำเร็จ");
        router.refresh();
      }
    });
  };
  return { error, flash, pending, run };
}

function Messages({ error, flash }: { error: string | null; flash: string | null }) {
  return (
    <div aria-live="polite">
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </div>
  );
}

/** ปุ่มเปิด/ปิดใช้งาน (ปิดใช้งานแทนการลบ) */
export function ActiveToggle({
  kind,
  id,
  active,
  label,
}: {
  kind: "announcement" | "announcement_file" | "download" | "calendar";
  id: string;
  active: boolean;
  label?: string;
}) {
  const { error, flash, pending, run } = useRun();
  const fn =
    kind === "announcement"
      ? setAnnouncementActive
      : kind === "announcement_file"
        ? setAnnouncementFileActive
        : kind === "download"
          ? setDownloadActive
          : setCalendarEventActive;
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        className={active ? "border-destructive text-destructive" : undefined}
        onClick={() => run(() => fn(id, !active))}
        data-testid={`toggle-${kind}`}
      >
        {label ?? (active ? "ปิดใช้งาน" : "เปิดใช้งาน")}
      </Button>
      <Messages error={error} flash={flash} />
    </span>
  );
}

// ---------------------------------------------------------------
// ข่าวประกาศ
// ---------------------------------------------------------------
export function AnnouncementForm({ item }: { item?: AdminAnnouncement }) {
  const { error, flash, pending, run } = useRun();
  const p = item?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-4"
      data-testid={item ? "announcement-edit" : "announcement-new"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(() => saveAnnouncement(item?.id ?? null, fd), () => {
          if (!item) form.reset();
          const f = form.elements.namedItem("files");
          if (f instanceof HTMLInputElement) f.value = "";
        });
      }}
    >
      <Field label="หัวข้อข่าว" name="title" id={`a-${p}-title`} required maxLength={300} defaultValue={item?.title} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`a-${p}-body`}>เนื้อหา</Label>
        <textarea id={`a-${p}-body`} name="body" maxLength={20000} defaultValue={item?.body} className={textareaClass} />
        <p className="text-sm text-muted-foreground">ข้อความธรรมดา ขึ้นบรรทัดใหม่ได้ ห้ามใส่ข้อมูลส่วนบุคคล (ข่าวเผยแพร่ต่อสาธารณะ)</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันเผยแพร่" name="published_on" id={`a-${p}-published`} required defaultValue={item?.published_on ?? todayIso()} />
        <ThaiDateInput label="วันหมดอายุ (ไม่บังคับ)" name="expires_on" id={`a-${p}-expires`} defaultValue={item?.expires_on} hint="พ้นวันนี้แล้วข่าวไม่แสดงบนหน้าแรก" />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="is_pinned" defaultChecked={item?.is_pinned} className="size-5" />
        ปักหมุด (แสดงก่อนข่าวอื่น)
      </label>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`a-${p}-files`}>แนบไฟล์ (ไม่บังคับ เลือกได้หลายไฟล์)</Label>
        <input id={`a-${p}-files`} name="files" type="file" multiple accept={SITE_FILE_ACCEPT} className="text-base" />
        <p className="text-sm text-muted-foreground">PDF Word Excel หรือรูป ไม่เกินไฟล์ละ 10 MB ไฟล์เปิดได้ทุกคน ห้ามมีข้อมูลส่วนบุคคล</p>
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : item ? "บันทึกการแก้ไข" : "เพิ่มข่าว"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// ดาวน์โหลด
// ---------------------------------------------------------------
export function DownloadForm({ item }: { item?: AdminDownload }) {
  const { error, flash, pending, run } = useRun();
  const p = item?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-4"
      data-testid={item ? "download-edit" : "download-new"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(() => saveDownload(item?.id ?? null, fd), () => {
          if (!item) form.reset();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`d-${p}-category`}>
            หมวด<span className="text-destructive"> *</span>
          </Label>
          <select id={`d-${p}-category`} name="category" required defaultValue={item?.category ?? ""} className={selectClass}>
            <option value="" disabled>
              เลือกหมวด
            </option>
            {DOWNLOAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOWNLOAD_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <Field label="ชื่อรายการ" name="title" id={`d-${p}-title`} required maxLength={300} defaultValue={item?.title} />
      </div>
      <Field label="คำอธิบาย (ไม่บังคับ)" name="description" id={`d-${p}-description`} maxLength={1000} defaultValue={item?.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`d-${p}-file`}>{item?.storage_path ? "แทนที่ไฟล์ (ไม่บังคับ)" : "ไฟล์"}</Label>
          <input id={`d-${p}-file`} name="file" type="file" accept={SITE_FILE_ACCEPT} className="text-base" />
          <p className="text-sm text-muted-foreground">PDF Word Excel หรือรูป ไม่เกิน 10 MB ห้ามมีข้อมูลส่วนบุคคล</p>
        </div>
        <Field
          label="หรือ ลิงก์ภายนอก"
          name="url"
          id={`d-${p}-url`}
          type="url"
          maxLength={1000}
          placeholder="https://"
          defaultValue={item?.url ?? ""}
          hint="ใช้อย่างใดอย่างหนึ่ง ไฟล์หรือลิงก์"
        />
      </div>
      <Field label="ลำดับ" name="sort_order" id={`d-${p}-sort`} type="number" className="w-32" defaultValue={item?.sort_order ?? 0} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : item ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// ปฏิทินงานสอบ
// ---------------------------------------------------------------
export function CalendarEventForm({ yearId, item }: { yearId: string; item?: CalendarEventRow }) {
  const { error, flash, pending, run } = useRun();
  const p = item?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-4"
      data-testid={item ? "calendar-edit" : "calendar-new"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(() => saveCalendarEvent(item?.id ?? null, yearId, fd), () => {
          if (!item) form.reset();
        });
      }}
    >
      <Field label="ชื่อรายการ" name="title" id={`c-${p}-title`} required maxLength={300} defaultValue={item?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันที่" name="starts_on" id={`c-${p}-starts`} required defaultValue={item?.starts_on} />
        <ThaiDateInput label="ถึงวันที่ (ไม่บังคับ)" name="ends_on" id={`c-${p}-ends`} defaultValue={item?.ends_on} />
      </div>
      <Field label="หมายเหตุ (ไม่บังคับ)" name="note" id={`c-${p}-note`} maxLength={1000} defaultValue={item?.note} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {item ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// ติดต่อเรา
// ---------------------------------------------------------------
export type ContactSettingsValue = {
  agency_name: string;
  address: string;
  phone: string;
  email: string;
  office_hours: string;
  latitude: number | null;
  longitude: number | null;
  map_note: string;
};

export function ContactSettingsForm({ value }: { value: ContactSettingsValue }) {
  const { error, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="contact-settings"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveContactSettings(fd));
      }}
    >
      <Field label="ชื่อหน่วยงาน" name="agency_name" id="cs-agency" maxLength={300} defaultValue={value.agency_name} hint="เว้นว่าง = ใช้ชื่อเว็บ" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="cs-address">ที่อยู่</Label>
        <textarea id="cs-address" name="address" maxLength={1000} defaultValue={value.address} className={textareaClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="โทรศัพท์" name="phone" id="cs-phone" maxLength={200} defaultValue={value.phone} hint="หลายเบอร์คั่นด้วย ,  (หมายเลขของหน่วยงาน ไม่ใช่เบอร์ส่วนตัว)" />
        <Field label="อีเมล" name="email" id="cs-email" type="email" maxLength={200} defaultValue={value.email} />
      </div>
      <Field label="เวลาทำการ" name="office_hours" id="cs-hours" maxLength={500} defaultValue={value.office_hours} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ละติจูด (แผนที่)" name="latitude" id="cs-lat" inputMode="decimal" maxLength={20} defaultValue={value.latitude ?? ""} />
        <Field label="ลองจิจูด (แผนที่)" name="longitude" id="cs-lng" inputMode="decimal" maxLength={20} defaultValue={value.longitude ?? ""} />
      </div>
      <Field label="คำอธิบายใต้แผนที่ (ไม่บังคับ)" name="map_note" id="cs-map-note" maxLength={300} defaultValue={value.map_note} />
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          บันทึกข้อมูลติดต่อ
        </Button>
      </div>
    </form>
  );
}

export function RecipientAdder({
  topic,
  roles,
  users,
}: {
  topic: string;
  roles: { key: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const { error, flash, pending, run } = useRun();
  const [kind, setKind] = useState<"role" | "user">("role");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid={`recipient-add-${topic}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => addTopicRecipient(topic, kind, String(fd.get("value") ?? "")));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        ชนิด
        <select value={kind} onChange={(e) => setKind(e.target.value as "role" | "user")} className={selectClass}>
          <option value="role">บทบาท</option>
          <option value="user">ผู้ใช้รายคน</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        {kind === "role" ? "บทบาท" : "ผู้ใช้"}
        <select key={kind} name="value" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            เลือก
          </option>
          {(kind === "role" ? roles.map((r) => ({ v: r.key, t: r.name })) : users.map((u) => ({ v: u.id, t: u.name }))).map((o) => (
            <option key={o.v} value={o.v}>
              {o.t}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        เพิ่มผู้รับ
      </Button>
      <div className="w-full">
        <Messages error={error} flash={flash} />
      </div>
    </form>
  );
}

export function RemoveRecipientButton({ id }: { id: string }) {
  const { error, pending, run } = useRun();
  return (
    <span className="inline-flex flex-col">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeTopicRecipient(id))} data-testid="recipient-remove">
        นำออก
      </Button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}
