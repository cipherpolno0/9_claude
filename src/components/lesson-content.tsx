import { FileText } from "lucide-react";

import { lessonMediaUrl, type LessonBlock } from "@/lib/quiz";

/**
 * แสดงเนื้อหาของบทเรียนตามลำดับชิ้น (ข้อความ รูป วิดีโอ YouTube ไฟล์ PDF)
 * ใช้ทั้งหน้าเรียนสาธารณะ และตัวอย่างในหน้าแก้ไขบทเรียน
 */
export function LessonContent({ blocks }: { blocks: LessonBlock[] }) {
  if (blocks.length === 0) return <p className="text-muted-foreground">(บทเรียนนี้ยังไม่มีเนื้อหา)</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="lesson-content">
      {blocks.map((block, i) => {
        if (block.type === "text") {
          return (
            <p key={i} className="text-lg leading-relaxed whitespace-pre-line">
              {block.text}
            </p>
          );
        }
        if (block.type === "image") {
          return (
            <figure key={i} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- รูปจากที่เก็บไฟล์ของ Supabase ขนาดไม่แน่นอน */}
              <img
                src={lessonMediaUrl(block.path)}
                alt={block.caption || "รูปประกอบบทเรียน"}
                loading="lazy"
                className="h-auto max-w-full rounded-lg border"
              />
              {block.caption ? <figcaption className="text-sm text-muted-foreground">{block.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "video") {
          return (
            <div key={i} className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
              <iframe
                title="วิดีโอประกอบบทเรียน"
                src={`https://www.youtube-nocookie.com/embed/${block.video_id}`}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="size-full"
              />
            </div>
          );
        }
        return (
          <p key={i}>
            <a
              href={lessonMediaUrl(block.path)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 py-2 font-semibold text-primary underline underline-offset-4"
            >
              <FileText aria-hidden className="size-5 shrink-0" />
              {block.title || "เปิดไฟล์ PDF"}
            </a>
          </p>
        );
      })}
    </div>
  );
}
