import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import type { PrivacyNoticeKey } from "@/lib/privacy";
import { fetchPublicPrivacy } from "@/lib/privacy-server";

/**
 * ข้อความแจ้งวัตถุประสงค์ตอนเก็บข้อมูลส่วนบุคคล (บทที่ 31) วางไว้ใกล้แบบฟอร์มที่เก็บข้อมูล
 * เนื้อความผู้ดูแลระบบกรอกที่ ผู้ดูแลระบบ > ข้อมูลส่วนบุคคล ถ้ายังไม่กรอกแสดงเฉพาะลิงก์นโยบาย
 */
export async function PrivacyNotice({ noticeKey, className }: { noticeKey: PrivacyNoticeKey; className?: string }) {
  const privacy = await fetchPublicPrivacy().catch(() => null);
  const notice = privacy?.notices[noticeKey];
  return (
    <aside
      className={`rounded-lg border bg-secondary/60 p-4 text-sm ${className ?? ""}`}
      aria-label="การเก็บข้อมูลส่วนบุคคล"
      data-testid="privacy-notice"
    >
      <p className="flex items-center gap-2 font-semibold text-primary">
        <ShieldCheck className="size-4" aria-hidden />
        การเก็บข้อมูลส่วนบุคคล
      </p>
      {notice?.body ? <p className="mt-1 whitespace-pre-line">{notice.body}</p> : null}
      <p className="mt-1">
        อ่านวัตถุประสงค์ ระยะเวลาเก็บ และสิทธิของท่านได้ที่{" "}
        <Link href="/privacy" prefetch={false} className="font-semibold text-primary underline underline-offset-4">
          นโยบายความเป็นส่วนตัว
        </Link>
      </p>
    </aside>
  );
}
