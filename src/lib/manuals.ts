/**
 * คู่มือผู้ใช้ (บทที่ 32) ไฟล์ PDF อยู่ที่ public/manuals/
 * - แยกตามบทบาท 4 เล่ม สร้างด้วย scripts/manuals/build.py (เนื้อหาที่ scripts/manuals/content.py)
 * - คู่มือฉบับสมบูรณ์ระบบที่ 1-9 เล่มเดียว สร้างด้วย scripts/manuals/build_full.py (เนื้อหาที่ scripts/manuals/full/*.py)
 * แก้แล้วสร้างใหม่ทุกครั้งที่หน้าจอเปลี่ยน
 */
export const USER_MANUALS = [
  { role: "ทุกระบบ (ฉบับสมบูรณ์ ระบบที่ 1-9)", file: "manual-full.pdf", description: "ใช้งานทุกระบบตามลำดับบทเรียน พร้อมภาพหน้าจอทุกขั้นตอนสำคัญ ภาคผนวกชนิดคำขอและศัพท์" },
  { role: "เลขานุการ", file: "manual-secretary.pdf", description: "ทะเบียนบุคลากร สถานที่ สนามสอบ ยื่นคำขอ งานสารบรรณ" },
  { role: "เจ้าคณะ", file: "manual-chief.pdf", description: "งานรอพิจารณา เห็นชอบ ส่งกลับ รับรองบัญชีสมัครสอบ อนุมัติงบและใบเบิก สั่งการหนังสือ" },
  { role: "เจ้าหน้าที่สำนักเรียน", file: "manual-school-officer.pdf", description: "สมัครสอบ: ดาวน์โหลดแม่แบบ อัปโหลด ตรวจ ยืนยัน ส่งบัญชี ดูผลสอบ" },
  { role: "ผู้ดูแลระบบ", file: "manual-admin.pdf", description: "นำเข้าข้อมูลจริง บัญชีผู้ใช้ สิทธิ์ตามบทบาท ค่าตั้ง ข้อมูลส่วนบุคคล สถานะระบบ" },
] as const;
