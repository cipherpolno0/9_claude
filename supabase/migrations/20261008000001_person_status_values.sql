-- บทที่ 7 (1/3): สถานะบุคคลชุดใหม่ 7 สถานะ
-- active ปฏิบัติหน้าที่ / transfer_pending อยู่ระหว่างขอย้าย / transferred ย้ายแล้ว / resigned ลาออก /
-- deceased มรณภาพ (บรรพชิต) หรือ ตาย (คฤหัสถ์) / disrobed ลาสิกขา / removed_other พ้นตำแหน่งด้วยเหตุอื่น
-- ค่าเดิมของบทที่ 5: moved_out (ย้ายออกนอกเขต) เปลี่ยนเป็น transferred (ย้ายแล้ว)

alter table public.persons
  drop constraint persons_status_check,
  add constraint persons_status_check check (
    status in ('active', 'transfer_pending', 'transferred', 'resigned', 'deceased', 'disrobed', 'removed_other', 'moved_out')
  );

update public.persons set status = 'transferred' where status = 'moved_out';

comment on table public.persons is 'ทะเบียนบุคคล: บรรพชิตและคฤหัสถ์ สถานะ: active ปฏิบัติหน้าที่ / transfer_pending อยู่ระหว่างขอย้าย / transferred ย้ายแล้ว / resigned ลาออก / deceased มรณภาพหรือตาย / disrobed ลาสิกขา / removed_other พ้นตำแหน่งด้วยเหตุอื่น';
