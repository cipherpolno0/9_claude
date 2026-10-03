-- บทที่ 4 (3/3): ที่เก็บไฟล์แนบกลาง (แบบส่วนตัว) และสิทธิ์ของไฟล์
-- อัปโหลดได้เฉพาะในโฟลเดอร์ของตนเอง ดาวน์โหลดได้เมื่อมองเห็นแถวในตาราง attachments (ตาม RLS)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array[
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'
  ]
)
on conflict (id) do nothing;

create policy attachments_upload_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy attachments_download_if_visible on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.attachments a where a.storage_path = name and a.is_active)
    )
  );

create policy attachments_remove_own_folder on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
