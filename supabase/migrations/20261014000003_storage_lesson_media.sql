-- บทที่ 13 (3/3): ที่เก็บรูปและไฟล์ PDF ของบทเรียน
-- เป็นที่เก็บแบบสาธารณะ (ทุกคนเปิดไฟล์ได้ด้วยลิงก์ เพราะหน้าเรียนไม่ต้องล็อกอิน) จึงห้ามเก็บข้อมูลส่วนบุคคลในที่เก็บนี้
-- อัปโหลดได้เฉพาะผู้จัดการคลังข้อสอบ ไม่มีสิทธิ์แก้ทับหรือลบจากหน้าเว็บ

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-media', 'lesson-media', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy lesson_media_upload_by_quiz_manager on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-media' and public.can_manage_quiz());
