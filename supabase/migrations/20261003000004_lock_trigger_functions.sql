-- บทที่ 2 (4/4): ปิดไม่ให้เรียกฟังก์ชัน trigger ผ่าน API โดยตรง
-- ฟังก์ชันเหล่านี้ทำงานผ่าน trigger เท่านั้น ไม่จำเป็นต้องให้ใครเรียกเอง
-- (แก้ตามคำเตือนด้านความปลอดภัยของ Supabase: SECURITY DEFINER function executable)

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.org_units_check_hierarchy() from public, anon, authenticated;
revoke execute on function public.org_units_check_children() from public, anon, authenticated;
