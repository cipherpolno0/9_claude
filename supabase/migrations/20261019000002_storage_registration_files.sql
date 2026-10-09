-- บทที่ 18 (2/2): ที่เก็บไฟล์ Excel ต้นฉบับของรายชื่อผู้สมัครสอบ (แบบส่วนตัว)
-- อัปโหลดได้เฉพาะในโฟลเดอร์ของตนเอง ดาวน์โหลดได้เมื่อมองเห็นชุดรายชื่อนั้น (ตาม RLS ของ registration_batches)
-- ไฟล์มีเลขประจำตัวประชาชน จึงไม่เปิดสาธารณะ และไม่มีสิทธิ์ลบผ่านหน้าเว็บ (เก็บไว้เป็นหลักฐาน)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-files', 'registration-files', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;

create policy registration_files_upload_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'registration-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy registration_files_download_if_visible on storage.objects for select to authenticated
  using (
    bucket_id = 'registration-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.registration_batches b where b.file_path = name)
    )
  );

-- ลบได้เฉพาะไฟล์ของตนที่ยังไม่ผูกกับชุดรายชื่อ (กรณีอัปโหลดแล้วสร้างชุดไม่สำเร็จ)
create policy registration_files_remove_orphan on storage.objects for delete to authenticated
  using (
    bucket_id = 'registration-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.registration_batches b where b.file_path = name)
  );
