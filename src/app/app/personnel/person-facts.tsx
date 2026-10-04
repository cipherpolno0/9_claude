import {
  NAK_THAM_LABEL,
  PALI_LABEL,
  PERSON_STATUS_LABEL,
  PERSON_TYPE_LABEL,
  ageOf,
  phansaOf,
  type Person,
} from "@/lib/persons";
import { thaiDate } from "@/lib/thai";

/** แถวข้อมูลแบบ หัวข้อ : ค่า ใช้ภายใน <dl> */
export function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[14rem_1fr]">
      <dt className="font-semibold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** ข้อมูลทั่วไปของบุคคล ใช้ทั้งหน้าประวัติรายบุคคลและหน้า ประวัติของฉัน (วางภายใน <dl>) */
export function PersonFacts({ person, unitName }: { person: Person; unitName: string }) {
  const monastic = person.person_type === "monastic";
  const phansa = monastic && person.status === "active" ? phansaOf(person.ordination_date) : null;
  const age = person.status === "deceased" ? null : ageOf(person.birth_date);

  return (
    <>
      <FactRow label="ประเภท">{PERSON_TYPE_LABEL[person.person_type]}</FactRow>
      <FactRow label="คำนำหน้าหรือสมณศักดิ์">{person.title || "-"}</FactRow>
      <FactRow label="ชื่อ">{person.first_name}</FactRow>
      {monastic ? <FactRow label="ฉายา">{person.monastic_name || "-"}</FactRow> : null}
      <FactRow label="นามสกุล">{person.last_name || "-"}</FactRow>
      <FactRow label="วันเกิด">
        {thaiDate(person.birth_date)}
        {age !== null ? ` (อายุ ${age} ปี)` : ""}
      </FactRow>
      <FactRow label="เลขประจำตัวประชาชน">
        {person.national_id_last4 ? `xxxxxxxxx${person.national_id_last4} (แสดงเฉพาะ 4 ตัวท้าย)` : "-"}
      </FactRow>
      {monastic ? (
        <>
          <FactRow label="วันอุปสมบท">{thaiDate(person.ordination_date)}</FactRow>
          <FactRow label="พรรษา (คำนวณ)">{phansa === null ? "-" : `${phansa} พรรษา`}</FactRow>
        </>
      ) : null}
      <FactRow label="น.ธ.">{NAK_THAM_LABEL[person.nak_tham] ?? "-"}</FactRow>
      <FactRow label="ป.ธ.">{PALI_LABEL[person.pali_grade] ?? "-"}</FactRow>
      <FactRow label="วุฒิสามัญ">{person.general_education || "-"}</FactRow>
      <FactRow label="วัดที่สังกัด">{person.temple_name || "-"}</FactRow>
      <FactRow label="เขตปกครอง">{unitName}</FactRow>
      <FactRow label="เบอร์ติดต่อ">{person.phone || "-"}</FactRow>
      <FactRow label="สถานะปัจจุบัน">{PERSON_STATUS_LABEL[person.status]}</FactRow>
    </>
  );
}
