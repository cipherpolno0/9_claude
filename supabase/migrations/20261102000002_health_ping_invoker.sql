-- บทที่ 32 (เพิ่มเติม): health_ping ไม่ต้องอ่านตารางใด จึงไม่ต้องเป็น security definer
-- ลดฟังก์ชัน security definer ที่บุคคลทั่วไปเรียกได้ลง 1 รายการ (ตัวตรวจความปลอดภัยของ Supabase)
alter function public.health_ping() security invoker;
