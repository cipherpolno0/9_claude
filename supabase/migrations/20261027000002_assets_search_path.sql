-- บทที่ 26 (ต่อ): กำหนด search_path ให้ฟังก์ชันคำนวณวันต้นปีและสิ้นปีงบประมาณ (ตามคำแนะนำ security advisor)
alter function private.fy_start(integer) set search_path = '';
alter function private.fy_end(integer) set search_path = '';
