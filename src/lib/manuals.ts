/**
 * คู่มือผู้ใช้แยกตามบทบาท (บทที่ 32) ไฟล์ PDF อยู่ที่ public/manuals/ สร้างใหม่ด้วย scripts/manuals/build.py
 * (ต้นฉบับเนื้อหาอยู่ที่ scripts/manuals/content.py แก้แล้วสร้างใหม่ทุกครั้งที่หน้าจอเปลี่ยน)
 */
export const USER_MANUALS = [
  { role: "เลขานุการ", file: "manual-secretary.pdf", description: "ทะเบียนบุคลากร สถานที่ สนามสอบ ยื่นคำขอ งานสารบรรณ" },
  { role: "เจ้าคณะ", file: "manual-chief.pdf", description: "งานรอพิจารณา เห็นชอบ ส่งกลับ รับรองบัญชีสมัครสอบ อนุมัติงบและใบเบิก สั่งการหนังสือ" },
  { role: "เจ้าหน้าที่สำนักเรียน", file: "manual-school-officer.pdf", description: "สมัครสอบ: ดาวน์โหลดแม่แบบ อัปโหลด ตรวจ ยืนยัน ส่งบัญชี ดูผลสอบ" },
  { role: "ผู้ดูแลระบบ", file: "manual-admin.pdf", description: "นำเข้าข้อมูลจริง บัญชีผู้ใช้ สิทธิ์ตามบทบาท ค่าตั้ง ข้อมูลส่วนบุคคล สถานะระบบ" },
] as const;
