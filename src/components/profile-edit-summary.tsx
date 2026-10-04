import { NAK_THAM_LABEL, PALI_LABEL, PERSON_FIELD_LABEL, PROFILE_EDIT_FIELDS } from "@/lib/persons";
import { thaiDate } from "@/lib/thai";

/** แสดงรายการที่ขอแก้ไขของคำขอแก้ไขประวัติ (ค่าเดิม → ค่าที่ขอ) */

function show(field: string, value: unknown): string {
  const v = value === null || value === undefined ? "" : String(value);
  if (v === "") return "(ว่าง)";
  if (field === "birth_date" || field === "ordination_date") return thaiDate(v);
  if (field === "nak_tham") return NAK_THAM_LABEL[v] ?? v;
  if (field === "pali_grade") return PALI_LABEL[v] ?? v;
  return v;
}

export function ProfileEditSummary({ payload, applied }: { payload: Record<string, unknown>; applied: boolean }) {
  const changes = (payload.changes ?? {}) as Record<string, unknown>;
  const before = (payload.before ?? {}) as Record<string, unknown>;
  const fields = PROFILE_EDIT_FIELDS.filter((f) => f in changes);

  return (
    <div data-testid="profile-edit-summary">
      {fields.length === 0 ? (
        <p className="text-muted-foreground">
          คำขอนี้ไม่มีรายการที่ระบบแก้ให้อัตโนมัติ ผู้พิจารณาอ่านรายละเอียดแล้วแก้ไขในทะเบียนบุคคลเอง
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="border-b px-3 py-2 font-semibold">ช่อง</th>
                  <th scope="col" className="border-b px-3 py-2 font-semibold">ค่าเดิม</th>
                  <th scope="col" className="border-b px-3 py-2 font-semibold">ค่าที่ขอแก้เป็น</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-semibold">{PERSON_FIELD_LABEL[f] ?? f}</td>
                    <td className="px-3 py-2">{show(f, before[f])}</td>
                    <td className="px-3 py-2">{show(f, changes[f])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-muted-foreground">
            {applied
              ? "คำขอได้รับอนุมัติแล้ว ระบบแก้ข้อมูลในทะเบียนบุคคลตามรายการข้างต้นให้แล้ว"
              : "เมื่อคำขอได้รับอนุมัติ ระบบจะแก้ข้อมูลในทะเบียนบุคคลตามรายการข้างต้นให้อัตโนมัติ"}
          </p>
        </>
      )}
    </div>
  );
}
