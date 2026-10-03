-- บทที่ 3 (4/4): ที่เก็บไฟล์หนังสือรับรองของคำขอบัญชี (แบบส่วนตัว)
-- ไม่มี policy ให้ผู้ใช้ทั่วไป: อัปโหลดและออกลิงก์ดูไฟล์ทำฝั่งเซิร์ฟเวอร์เท่านั้น
-- หลังตรวจสิทธิ์ของผู้ขอดูจากตาราง account_requests แล้ว

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-letters', 'account-letters', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
