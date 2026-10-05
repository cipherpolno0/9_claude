"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileText, ImageIcon, Trash2, Type, Video } from "lucide-react";

import { ErrorText, InfoText } from "@/components/form";
import { LessonContent } from "@/components/lesson-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/errors";
import { LESSON_BLOCK_LABEL, LESSON_MAX_BLOCKS, lessonMediaUrl, youtubeId, type LessonBlock, type QuestionStatus } from "@/lib/quiz";

import { saveLesson, setLessonActive, setLessonStatus, uploadLessonMedia } from "../../actions";

// ชิ้นเนื้อหาระหว่างแก้ไข: มี key ของหน้าจอ และวิดีโอเก็บลิงก์ที่ผู้ใช้พิมพ์ไว้ใน video_id จนกว่าจะบันทึก
type Draft = LessonBlock & { key: number };

const textareaClass =
  "min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const ADD_BUTTONS: { type: LessonBlock["type"]; icon: typeof Type }[] = [
  { type: "text", icon: Type },
  { type: "image", icon: ImageIcon },
  { type: "video", icon: Video },
  { type: "pdf", icon: FileText },
];

/** ตัด key ของหน้าจอออกก่อนส่งให้เซิร์ฟเวอร์ */
function toBlock(draft: Draft): LessonBlock {
  if (draft.type === "text") return { type: "text", text: draft.text };
  if (draft.type === "image") return { type: "image", path: draft.path, caption: draft.caption };
  if (draft.type === "video") return { type: "video", video_id: draft.video_id };
  return { type: "pdf", path: draft.path, title: draft.title };
}

const emptyBlock = (type: LessonBlock["type"]): LessonBlock =>
  type === "text"
    ? { type, text: "" }
    : type === "image"
      ? { type, path: "", caption: "" }
      : type === "video"
        ? { type, video_id: "" }
        : { type, path: "", title: "" };

/** ตัวแก้ไขบทเรียน: หัวข้อ + ชิ้นเนื้อหาเรียงตามลำดับ (เพิ่ม สลับ ลบ) ตัวอย่าง และปุ่มเผยแพร่ */
export function LessonEditor({
  lessonId,
  initialTitle,
  initialBlocks,
  status,
  isActive,
}: {
  lessonId: string;
  initialTitle: string;
  initialBlocks: LessonBlock[];
  status: QuestionStatus;
  isActive: boolean;
}) {
  const router = useRouter();
  const nextKey = useRef(initialBlocks.length);
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<Draft[]>(() => initialBlocks.map((b, i) => ({ ...b, key: i })));
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: Draft[]) => {
    setBlocks(next);
    setDirty(true);
  };
  const patch = (key: number, values: Partial<LessonBlock>) =>
    change(blocks.map((b) => (b.key === key ? ({ ...b, ...values } as Draft) : b)));
  const move = (index: number, delta: number) => {
    const next = [...blocks];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  };
  const add = (type: LessonBlock["type"]) => {
    nextKey.current += 1;
    change([...blocks, { ...emptyBlock(type), key: nextKey.current }]);
  };

  const upload = async (key: number, kind: "image" | "pdf", file: File | undefined) => {
    if (!file) return;
    setUploading(key);
    setResult(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("kind", kind);
    const done = await uploadLessonMedia(lessonId, formData);
    setUploading(null);
    if (!done.ok) {
      setResult(done);
      return;
    }
    const current = blocks.find((b) => b.key === key);
    patch(key, kind === "pdf" && current?.type === "pdf" && !current.title ? { path: done.path, title: file.name.replace(/\.pdf$/i, "") } : { path: done.path });
  };

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) {
        after?.();
        router.refresh();
      }
    });

  const save = () =>
    run(
      () =>
        saveLesson(
          lessonId,
          title,
          blocks.map(toBlock),
        ),
      () => {
        setDirty(false);
        // แปลงลิงก์วิดีโอที่พิมพ์ไว้เป็นรหัสวิดีโอ ให้ตรงกับที่บันทึก
        setBlocks((list) => list.map((b) => (b.type === "video" ? { ...b, video_id: youtubeId(b.video_id) ?? b.video_id } : b)));
      },
    );

  // ตัวอย่าง: แสดงเฉพาะชิ้นที่กรอกครบแล้ว
  const previewBlocks = blocks.flatMap((b): LessonBlock[] => {
    if (b.type === "text") return b.text.trim() ? [{ type: "text", text: b.text.trim() }] : [];
    if (b.type === "video") {
      const id = youtubeId(b.video_id);
      return id ? [{ type: "video", video_id: id }] : [];
    }
    return b.path ? [b] : [];
  });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="lesson-title">
            หัวข้อบทเรียน<span className="text-destructive"> *</span>
          </Label>
          <Input
            id="lesson-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5" data-testid="lesson-blocks">
        <h2 className="text-xl font-bold text-primary">เนื้อหา ({blocks.length.toLocaleString("th-TH")} ชิ้น)</h2>
        <p className="text-muted-foreground">
          เนื้อหาแสดงตามลำดับชิ้นจากบนลงล่าง เพิ่มได้ไม่เกิน {LESSON_MAX_BLOCKS} ชิ้น รูปและไฟล์ PDF ของบทเรียนเปิดดูได้ทุกคน
          จึงห้ามใส่ข้อมูลส่วนบุคคล
        </p>
        <ol className="mt-3 flex flex-col gap-3">
          {blocks.map((b, i) => (
            <li key={b.key} className="rounded-lg border p-3" data-block={b.type}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 font-semibold">
                  ชิ้นที่ {(i + 1).toLocaleString("th-TH")}: {LESSON_BLOCK_LABEL[b.type]}
                </p>
                <Button type="button" variant="outline" size="icon" aria-label={`เลื่อนชิ้นที่ ${i + 1} ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`เลื่อนชิ้นที่ ${i + 1} ลง`}
                  disabled={i === blocks.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`ลบชิ้นที่ ${i + 1}`}
                  onClick={() => {
                    if (window.confirm(`ลบชิ้นที่ ${i + 1} (${LESSON_BLOCK_LABEL[b.type]}) ใช่หรือไม่ (มีผลเมื่อกดบันทึก)`)) {
                      change(blocks.filter((x) => x.key !== b.key));
                    }
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                {b.type === "text" ? (
                  <textarea
                    aria-label={`ข้อความของชิ้นที่ ${i + 1}`}
                    className={textareaClass}
                    value={b.text}
                    onChange={(e) => patch(b.key, { text: e.target.value })}
                  />
                ) : null}

                {b.type === "video" ? (
                  <>
                    <Input
                      aria-label={`ลิงก์ YouTube ของชิ้นที่ ${i + 1}`}
                      placeholder="วางลิงก์ YouTube เช่น https://www.youtube.com/watch?v=..."
                      value={b.video_id}
                      onChange={(e) => patch(b.key, { video_id: e.target.value })}
                    />
                    {b.video_id && !youtubeId(b.video_id) ? (
                      <p className="text-sm text-destructive">ลิงก์นี้ไม่ใช่ลิงก์วิดีโอ YouTube</p>
                    ) : null}
                  </>
                ) : null}

                {b.type === "image" ? (
                  <>
                    {b.path ? (
                      // eslint-disable-next-line @next/next/no-img-element -- รูปจากที่เก็บไฟล์ของ Supabase ขนาดไม่แน่นอน
                      <img src={lessonMediaUrl(b.path)} alt="รูปที่อัปโหลดแล้ว" className="max-h-48 w-auto self-start rounded-md border" />
                    ) : null}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={`ไฟล์รูปของชิ้นที่ ${i + 1}`}
                      disabled={uploading !== null}
                      onChange={(e) => upload(b.key, "image", e.target.files?.[0])}
                      className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
                    />
                    <p className="text-sm text-muted-foreground">
                      {uploading === b.key ? "กำลังอัปโหลด..." : b.path ? "อัปโหลดแล้ว เลือกไฟล์ใหม่เพื่อเปลี่ยนรูป" : "รูป JPG, PNG หรือ WebP ไม่เกิน 5 MB"}
                    </p>
                    <Input
                      aria-label={`คำบรรยายรูปของชิ้นที่ ${i + 1}`}
                      placeholder="คำบรรยายรูป (เว้นว่างได้)"
                      value={b.caption}
                      onChange={(e) => patch(b.key, { caption: e.target.value })}
                    />
                  </>
                ) : null}

                {b.type === "pdf" ? (
                  <>
                    <input
                      type="file"
                      accept="application/pdf"
                      aria-label={`ไฟล์ PDF ของชิ้นที่ ${i + 1}`}
                      disabled={uploading !== null}
                      onChange={(e) => upload(b.key, "pdf", e.target.files?.[0])}
                      className="w-full rounded-md border border-input p-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
                    />
                    <p className="text-sm text-muted-foreground">
                      {uploading === b.key ? "กำลังอัปโหลด..." : b.path ? "อัปโหลดแล้ว เลือกไฟล์ใหม่เพื่อเปลี่ยนไฟล์" : "ไฟล์ PDF ไม่เกิน 10 MB"}
                    </p>
                    <Input
                      aria-label={`ชื่อที่แสดงของไฟล์ PDF ชิ้นที่ ${i + 1}`}
                      placeholder="ชื่อที่แสดงบนปุ่มเปิดไฟล์ (เว้นว่าง = เปิดไฟล์ PDF)"
                      value={b.title}
                      onChange={(e) => patch(b.key, { title: e.target.value })}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="font-medium">เพิ่มชิ้นเนื้อหา:</span>
          {ADD_BUTTONS.map(({ type, icon: Icon }) => (
            <Button key={type} type="button" variant="outline" disabled={blocks.length >= LESSON_MAX_BLOCKS} onClick={() => add(type)}>
              <Icon aria-hidden />
              {LESSON_BLOCK_LABEL[type]}
            </Button>
          ))}
        </div>
      </div>

      {result ? result.ok ? <InfoText>{result.message}</InfoText> : <ErrorText>{result.error}</ErrorText> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || uploading !== null}>
          {pending ? "กำลังดำเนินการ..." : "บันทึกบทเรียน"}
        </Button>
        {isActive ? (
          status === "draft" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending || dirty}
              onClick={() => run(() => setLessonStatus(lessonId, "published"))}
            >
              เผยแพร่
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setLessonStatus(lessonId, "draft"))}>
              ถอนกลับเป็นร่าง
            </Button>
          )
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (isActive && !window.confirm("ปิดใช้งานบทเรียนนี้ใช่หรือไม่ (ข้อมูลไม่ถูกลบ ผู้เรียนจะไม่เห็นบทเรียนนี้ และเปิดใช้งานใหม่ได้)")) return;
            run(() => setLessonActive(lessonId, !isActive));
          }}
        >
          {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        </Button>
        {dirty ? <span className="text-sm text-muted-foreground">มีการแก้ไขที่ยังไม่ได้บันทึก{status === "draft" ? " (บันทึกก่อนจึงเผยแพร่ได้)" : ""}</span> : null}
      </div>

      <div className="rounded-xl border-2 border-dashed border-input bg-secondary p-5" data-testid="lesson-preview">
        <p className="text-sm font-semibold text-muted-foreground">ตัวอย่างตามที่ผู้เรียนจะเห็น</p>
        <h2 className="mt-2 mb-3 text-xl font-bold text-primary">{title || "(ยังไม่ได้กรอกหัวข้อ)"}</h2>
        <LessonContent blocks={previewBlocks} />
      </div>
    </div>
  );
}
