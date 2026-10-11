-- บทที่ 30 (2/2): ที่เก็บไฟล์ของข่าวประกาศและหน้าดาวน์โหลด
-- เป็นที่เก็บแบบสาธารณะ (ทุกคนเปิดไฟล์ได้ด้วยลิงก์ เพราะหน้าแรกและหน้าดาวน์โหลดไม่ต้องล็อกอิน) จึงห้ามเก็บข้อมูลส่วนบุคคล
-- อัปโหลดได้เฉพาะผู้จัดการเนื้อหาของเว็บ (ผู้ดูแลระบบและส่วนกลาง) ในโฟลเดอร์ announcements/ และ downloads/ ไม่มีแก้ทับหรือลบจากหน้าเว็บ
-- (นำไฟล์ออก = ปิดใช้งานแถวในตาราง announcement_files / downloads)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-files', 'site-files', true, 20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do nothing;

create policy site_files_upload_by_content_manager on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-files'
    and public.can_manage_site_content()
    and (name like 'announcements/%' or name like 'downloads/%')
  );
