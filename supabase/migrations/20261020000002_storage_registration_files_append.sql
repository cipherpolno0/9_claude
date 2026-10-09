-- บทที่ 19 (2/2): ไฟล์เพิ่มเติมของบัญชีผู้สมัครสอบ (ตาราง registration_files) ใช้ที่เก็บ registration-files เดียวกัน
-- ดาวน์โหลดได้เมื่อเห็นบัญชี และลบได้เฉพาะไฟล์ของตนที่ยังไม่ผูกกับบัญชีหรือไฟล์เพิ่มเติม

alter policy registration_files_download_if_visible on storage.objects
  using (
    bucket_id = 'registration-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.registration_batches b where b.file_path = name)
      or exists (select 1 from public.registration_files f where f.file_path = name)
    )
  );

alter policy registration_files_remove_orphan on storage.objects
  using (
    bucket_id = 'registration-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.registration_batches b where b.file_path = name)
    and not exists (select 1 from public.registration_files f where f.file_path = name)
  );
