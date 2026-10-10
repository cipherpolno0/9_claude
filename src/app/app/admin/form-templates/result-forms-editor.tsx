"use client";

import { useRef, useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXAM_TYPE_LABEL } from "@/lib/exam-forms";
import { MAX_SIGNATURES, signaturesProblem } from "@/lib/exam-lists";
import type { ResultForm } from "@/lib/exam-results";

import { saveResultForm } from "../../exams/results/actions";

function ResultFormCard({ form }: { form: ResultForm }) {
  const [code, setCode] = useState(form.code);
  const [certify, setCertify] = useState(form.certify_text);
  const [sigs, setSigs] = useState(() => form.signatures.map((s, i) => ({ text: s.text, uid: i })));
  const next = useRef(form.signatures.length);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = `rf-${form.exam_type}`;

  return (
    <li className="rounded-xl border bg-card p-4" data-testid="result-form-card" data-type={form.exam_type}>
      <h3 className="text-lg font-bold">
        บัญชีผู้สอบได้ {EXAM_TYPE_LABEL[form.exam_type]}
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${p}-code`} className="text-sm">
            รหัสแบบ
          </Label>
          <Input id={`${p}-code`} value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${p}-certify`} className="text-sm">
            ข้อความรับรองท้ายบัญชี
          </Label>
          <Input id={`${p}-certify`} value={certify} maxLength={200} onChange={(e) => setCertify(e.target.value)} />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        ช่องลงนาม: พิมพ์เส้นสำหรับลงลายมือชื่อ แล้วตามด้วยข้อความที่กรอก เช่น ชื่อในวงเล็บ และตำแหน่ง (หลายบรรทัดได้) ท้ายสุดพิมพ์วันที่ประกาศผลให้
      </p>
      <ol className="mt-2 flex flex-col gap-2">
        {sigs.map((x, i) => (
          <li key={x.uid} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${p}-sig-${x.uid}`}>ช่องลงนามที่ {i + 1}</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSigs((l) => l.filter((y) => y.uid !== x.uid))}>
                นำออก
              </Button>
            </div>
            <textarea
              id={`${p}-sig-${x.uid}`}
              rows={3}
              maxLength={300}
              value={x.text}
              onChange={(e) => setSigs((l) => l.map((y) => (y.uid === x.uid ? { ...y, text: e.target.value } : y)))}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={sigs.length >= MAX_SIGNATURES}
          onClick={() => setSigs((l) => [...l, { text: "", uid: next.current++ }])}
        >
          เพิ่มช่องลงนาม
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            const signatures = sigs.map((s) => ({ text: s.text })).filter((s) => s.text.trim());
            const problem = signaturesProblem(signatures);
            setFlash(null);
            if (problem) {
              setError(problem);
              return;
            }
            startTransition(async () => {
              const r = await saveResultForm(form.exam_type, { code, certify_text: certify, signatures });
              if (r.ok) {
                setError(null);
                setFlash(r.message ?? null);
              } else setError(r.error);
            });
          }}
        >
          {pending ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
        <InfoText>{flash}</InfoText>
      </div>
    </li>
  );
}

/** แบบบัญชีผู้สอบได้ ศ.๔ (นักธรรม) ศ.๘ (ธรรมศึกษา): รหัสแบบ ข้อความรับรอง และช่องลงนาม (ผู้ดูแลระบบตั้งเอง) */
export function ResultFormsEditor({ forms }: { forms: ResultForm[] }) {
  return (
    <section className="mt-8" aria-labelledby="result-forms">
      <h2 id="result-forms" className="text-xl font-bold text-primary">
        บัญชีผู้สอบได้ (ศ.๔ ศ.๘)
      </h2>
      <p className="mt-1 text-muted-foreground">
        ใช้ในหน้าพิมพ์บัญชีรายชื่อผู้สอบได้ (ผลสอบ &gt; บัญชีผู้สอบได้) หัวบัญชีและคอลัมน์ตั้งตามไฟล์จริงฉบับ 2568
      </p>
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {forms.map((f) => (
          <ResultFormCard key={f.exam_type} form={f} />
        ))}
      </ul>
    </section>
  );
}
