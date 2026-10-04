import { isNoticeType, statusTypeLabel } from "@/lib/status";
import { thaiDate } from "@/lib/thai";

/** สรุปคำขอเปลี่ยนสถานะหรือการแจ้ง ในหน้ารายละเอียดคำขอ */
export function StatusRequestSummary({
  typeKey,
  payload,
  applied,
}: {
  typeKey: string;
  payload: Record<string, unknown>;
  applied: boolean;
}) {
  const text = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");
  const personType = text("person_type");
  const notice = isNoticeType(typeKey);
  const rows: [string, string][] = [
    ["เรื่อง", statusTypeLabel(typeKey, personType)],
    ["บุคคล", text("person_name") || "-"],
    [notice ? "วันที่" : "วันที่มีผล", thaiDate(text("effective_on"))],
  ];
  if (typeKey === "transfer") {
    rows.push(
      ["ต้นทาง", [text("from_place"), text("from_unit_name")].filter(Boolean).join(" · ") || "-"],
      ["ปลายทาง", [text("to_place"), text("to_unit_name")].filter(Boolean).join(" · ") || "-"],
    );
  } else {
    rows.push(["หน่วยต้นสังกัด", text("from_unit_name") || "-"]);
  }

  return (
    <div data-testid="status-request-summary">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-muted-foreground">
        {applied
          ? "ดำเนินการแล้ว: ระบบปิดตำแหน่งปกครองและรายการ จศป. ของบุคคลนี้ เปลี่ยนสถานะ และแจ้งหน่วยที่ตำแหน่งว่างแล้ว"
          : notice
            ? "เมื่อหน่วยเหนือกดรับทราบ ระบบจะปิดตำแหน่งปกครองและรายการ จศป. ของบุคคลนี้ เปลี่ยนสถานะ และแจ้งหน่วยที่ตำแหน่งว่าง (ต้องมีหลักฐานแนบ)"
            : "เมื่อได้รับอนุมัติครบทุกขั้น ระบบจะปิดตำแหน่งปกครองและรายการ จศป. ของบุคคลนี้ เปลี่ยนสถานะ และแจ้งหน่วยที่ตำแหน่งว่าง"}
      </p>
    </div>
  );
}
