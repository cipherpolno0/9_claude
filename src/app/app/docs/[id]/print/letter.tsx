"use client";

import { useDigits } from "@/components/print/print-page";
import { DOC_URGENCY_LABEL, docClassShort, type DocClass, type DocKind, type DocUrgency } from "@/lib/docs";

/**
 * หนังสือบนกระดาษ A4 (ฟอนต์ Sarabun ตัวเลขตามที่เลือกในแถบเครื่องมือ ค่าเริ่มต้นเลขไทย)
 * หนังสือภายนอก/หนังสือเวียน: ตรากลางบน ที่ ซ้าย ส่วนงานและที่ตั้งขวา วันที่ เรื่อง คำขึ้นต้น เนื้อความ คำลงท้าย ผู้ลงนาม
 * หนังสือภายใน: บันทึกข้อความ / คำสั่ง และ ประกาศ: ชื่อเอกสารกลางหน้า ท้ายด้วย สั่ง ณ วันที่ / ประกาศ ณ วันที่
 */
export type LetterData = {
  kind: DocKind;
  draft: boolean;
  docNo: string;
  dateText: string;
  agency: string;
  address: string;
  toText: string;
  salutation: string;
  subject: string;
  body: string;
  closing: string;
  signerName: string;
  signerPosition: string;
  urgency: DocUrgency;
  classification: DocClass;
  emblemUrl: string | null;
};

function Paragraphs({ text }: { text: string }) {
  const d = useDigits();
  const parts = text.split("\n");
  return (
    <div className="mt-3" data-testid="letter-body">
      {parts.map((p, i) =>
        p.trim() === "" ? (
          <p key={i} className="h-4" aria-hidden />
        ) : (
          <p key={i} className="text-justify indent-[2.5cm] leading-[1.75]">
            {d(p)}
          </p>
        ),
      )}
    </div>
  );
}

function Signature({ closing, name, position }: { closing?: string; name: string; position: string }) {
  const d = useDigits();
  return (
    <div className="mt-6 ml-[45%] text-center" data-testid="letter-signature">
      {closing ? <p>{d(closing)}</p> : null}
      <div className="h-16" aria-hidden />
      <p>({name ? d(name) : " ".repeat(40)})</p>
      {position
        ? position.split("\n").map((line, i) => (
            <p key={i}>{d(line)}</p>
          ))
        : null}
    </div>
  );
}

function Emblem({ url, size }: { url: string | null; size: "lg" | "sm" }) {
  if (!url) return <div className={size === "lg" ? "h-[3cm]" : "h-[1.5cm] w-[1.5cm]"} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวของไฟล์แนบ ไม่ผ่านตัวปรับรูปของ Next
    <img src={url} alt="ตรา" className={size === "lg" ? "mx-auto h-[3cm] w-auto" : "h-[1.5cm] w-auto"} data-testid="letter-emblem" />
  );
}

function Stamp({ urgency, classification, bottom = false }: { urgency: DocUrgency; classification: DocClass; bottom?: boolean }) {
  const cls = docClassShort(classification);
  if (bottom) return cls ? <p className="mt-8 text-center text-2xl font-bold text-red-700">{cls}</p> : null;
  if (!cls && urgency === "normal") return null;
  return (
    <div className="mb-2 flex items-start justify-between" data-testid="letter-stamp">
      <span className="text-2xl font-bold text-red-700">{urgency !== "normal" ? DOC_URGENCY_LABEL[urgency] : ""}</span>
      <span className="text-2xl font-bold text-red-700">{cls}</span>
      <span className="w-24" />
    </div>
  );
}

export function Letter({ data }: { data: LetterData }) {
  const d = useDigits();
  const no = data.draft ? "......................" : data.docNo;
  const date = data.draft ? "......................" : data.dateText;
  const greeting = [data.salutation, data.toText].filter(Boolean).join("  ");

  if (data.kind === "internal") {
    return (
      <div className="text-[16px]" data-testid="letter" data-kind="internal">
        <Stamp urgency={data.urgency} classification={data.classification} />
        <div className="flex items-end gap-4">
          <Emblem url={data.emblemUrl} size="sm" />
          <h2 className="flex-1 pr-[1.5cm] text-center text-[29px] font-bold">บันทึกข้อความ</h2>
        </div>
        <p className="mt-3">
          <span className="font-bold">ส่วนราชการ</span> {d(data.agency)}
          {data.address ? ` ${d(data.address.replace(/\n/g, " "))}` : ""}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-8">
          <span>
            <span className="font-bold">ที่</span> {d(no)}
          </span>
          <span>
            <span className="font-bold">วันที่</span> {d(date)}
          </span>
        </p>
        <p className="mt-1">
          <span className="font-bold">เรื่อง</span> {d(data.subject)}
        </p>
        {greeting ? <p className="mt-3">{d(greeting)}</p> : null}
        <Paragraphs text={data.body} />
        <Signature closing={data.closing} name={data.signerName} position={data.signerPosition} />
        <Stamp urgency={data.urgency} classification={data.classification} bottom />
      </div>
    );
  }

  if (data.kind === "order" || data.kind === "announcement") {
    const title = data.kind === "order" ? "คำสั่ง" : "ประกาศ";
    const at = data.kind === "order" ? "สั่ง ณ วันที่" : "ประกาศ ณ วันที่";
    return (
      <div className="text-[16px]" data-testid="letter" data-kind={data.kind}>
        <Stamp urgency={data.urgency} classification={data.classification} />
        <Emblem url={data.emblemUrl} size="lg" />
        <div className="mt-2 text-center">
          <p className="font-bold">
            {title}
            {d(data.agency)}
          </p>
          <p>ที่ {d(no)}</p>
          <p>เรื่อง {d(data.subject)}</p>
          <p className="tracking-[0.3em]">-------------------------</p>
        </div>
        <Paragraphs text={data.body} />
        <p className="mt-6 indent-[2.5cm]">
          {at} {d(date)}
        </p>
        <Signature name={data.signerName} position={data.signerPosition} />
        <Stamp urgency={data.urgency} classification={data.classification} bottom />
      </div>
    );
  }

  // หนังสือภายนอกและหนังสือเวียน
  return (
    <div className="text-[16px]" data-testid="letter" data-kind={data.kind}>
      <Stamp urgency={data.urgency} classification={data.classification} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <p className="self-end">ที่ {d(no)}</p>
        <Emblem url={data.emblemUrl} size="lg" />
        <div className="self-end pl-[1cm]">
          <p>{d(data.agency)}</p>
          {data.address ? <p className="whitespace-pre-line">{d(data.address)}</p> : null}
        </div>
      </div>
      <p className="mt-3 ml-[50%]">{d(date)}</p>
      <p className="mt-3">
        เรื่อง&nbsp;&nbsp;{d(data.subject)}
      </p>
      {greeting ? <p className="mt-3">{d(greeting)}</p> : null}
      <Paragraphs text={data.body} />
      <Signature closing={data.closing} name={data.signerName} position={data.signerPosition} />
      <Stamp urgency={data.urgency} classification={data.classification} bottom />
    </div>
  );
}
