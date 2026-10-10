import { CONDITION_LABEL, type AssetCondition } from "@/lib/assets";
import { baht } from "@/lib/budget";
import { thaiDate } from "@/lib/thai";

/** สรุปคำขอจำหน่ายครุภัณฑ์จาก requests.payload (หน้ารายละเอียดคำขอกลาง) */
export function AssetDisposalSummary({ payload }: { payload: Record<string, unknown> }) {
  const s = (k: string) => (typeof payload[k] === "string" || typeof payload[k] === "number" ? String(payload[k]) : "");
  const prev = s("prev_condition") as AssetCondition;
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[12rem_1fr]" data-testid="asset-disposal-summary">
      <dt className="text-muted-foreground">ครุภัณฑ์</dt>
      <dd>
        {s("asset_no")} {s("name")}
      </dd>
      <dt className="text-muted-foreground">ประเภท</dt>
      <dd>{s("type_name")}</dd>
      <dt className="text-muted-foreground">หน่วยที่ครอบครอง</dt>
      <dd>{s("unit_name")}</dd>
      <dt className="text-muted-foreground">วันที่ได้มา</dt>
      <dd>{s("acquired_on") ? thaiDate(s("acquired_on")) : "-"}</dd>
      <dt className="text-muted-foreground">ราคา</dt>
      <dd>{baht(s("price"))} บาท</dd>
      <dt className="text-muted-foreground">มูลค่าสุทธิขณะยื่น</dt>
      <dd>{baht(s("net_value"))} บาท</dd>
      <dt className="text-muted-foreground">สภาพก่อนยื่น</dt>
      <dd>{CONDITION_LABEL[prev] ?? "-"}</dd>
    </dl>
  );
}
