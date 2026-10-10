"use client";

import { PrintPage, useDigits } from "@/components/print/print-page";

export type Label = { id: string; assetNo: string; name: string; unitName: string; svg: string };

function Grid({ labels }: { labels: Label[] }) {
  const d = useDigits();
  if (labels.length === 0) return <p>ไม่มีครุภัณฑ์ให้พิมพ์ป้าย</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2" data-testid="qr-labels">
      {labels.map((l) => (
        <div key={l.id} className="flex break-inside-avoid items-center gap-2 rounded border border-black p-2" data-testid="qr-label">
          <div className="size-24 shrink-0 bg-white" role="img" aria-label={`QR ${l.assetNo}`} dangerouslySetInnerHTML={{ __html: l.svg }} />
          <div className="min-w-0 text-sm leading-snug">
            <p className="font-bold break-all">{d(l.assetNo)}</p>
            <p className="line-clamp-2">{d(l.name)}</p>
            <p className="line-clamp-2 text-xs">{d(l.unitName)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LabelsSheet({ labels }: { labels: Label[] }) {
  return (
    <PrintPage title="ป้ายครุภัณฑ์" subtitle={`${labels.length} ป้าย · สแกนเพื่อเปิดข้อมูลครุภัณฑ์ (ต้องเข้าสู่ระบบ)`}>
      <Grid labels={labels} />
    </PrintPage>
  );
}
