"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { UserRound } from "lucide-react";

import { ErrorText } from "@/components/form";

import { uploadPersonPhoto } from "../actions";

/** รูปถ่ายของบุคคล (เก็บในที่เก็บไฟล์แนบกลาง ดูได้ตามสิทธิ์ดูทะเบียนบุคคล) */
export function PersonPhoto({
  personId,
  url,
  name,
  canEdit,
}: {
  personId: string;
  url: string | null;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("person_id", personId);
    setError(null);
    startTransition(async () => {
      const result = await uploadPersonPhoto(formData);
      if (!result.ok) setError(result.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="flex w-40 shrink-0 flex-col gap-2" data-testid="person-photo">
      <div className="flex aspect-[3/4] w-40 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจากที่เก็บไฟล์ส่วนตัว ใช้ตัวปรับขนาดรูปของ Next ไม่ได้
          <img src={url} alt={`รูปถ่ายของ ${name}`} className="size-full object-cover" />
        ) : (
          <UserRound className="size-16 text-muted-foreground" aria-label="ยังไม่มีรูปถ่าย" />
        )}
      </div>
      {canEdit ? (
        <label className="text-sm">
          <span className="font-semibold">{url ? "เปลี่ยนรูปถ่าย" : "เพิ่มรูปถ่าย"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            disabled={pending}
            aria-label="เลือกรูปถ่าย"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="mt-1 w-full rounded-md border border-input p-1 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1"
          />
          <span className="text-muted-foreground">{pending ? "กำลังบันทึก..." : "JPG หรือ PNG ไม่เกิน 10 MB"}</span>
        </label>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
