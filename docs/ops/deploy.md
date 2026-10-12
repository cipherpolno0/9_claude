# วิธี deploy (Vercel + Supabase 2 ชุด)

เอกสารนี้สำหรับผู้ดูแลระบบต่อทางเทคนิค ลำดับการขึ้นใช้งานครั้งแรกทั้งหมดอยู่ที่ [ขึ้นใช้งานจริง.md](ขึ้นใช้งานจริง.md)

## 1. สภาพแวดล้อม 2 ชุด

| | ชุดทดสอบ (staging) | ชุดใช้งานจริง (production) |
|---|---|---|
| ฐานข้อมูล Supabase | โครงการ `registry-staging` รหัส `zqdzfugqvmxwoteiptob` (สร้างในบทที่ 32 แผนฟรี: ไม่มีการใช้งาน 7 วันจะถูกหยุดชั่วคราว กด Restore ที่หน้าโครงการเพื่อเปิดใหม่) | โครงการ `ukdlgujfongdesbbnblm` |
| Vercel | Preview (กิ่ง `staging` และทุกกิ่งที่ไม่ใช่ main) | Production (กิ่ง `main`) |
| `NEXT_PUBLIC_APP_ENV` | `staging` = แถบเตือน "ชุดทดสอบ" ทุกหน้า และห้ามเครื่องมือค้นหาเก็บหน้าเว็บ | `production` |
| ข้อมูล | บัญชีทดสอบ test.*@example.com และข้อมูลสมมุติ ห้ามกรอกข้อมูลบุคคลจริง | ข้อมูลจริงเท่านั้น |
| ผู้เข้าถึง | ทีมพัฒนาและผู้ทดสอบ (เปิด Vercel Authentication ไว้) | ผู้ใช้ทุกคน |

ทุกการเปลี่ยนแปลงทำบนชุดทดสอบก่อนเสมอ ผ่านแล้วจึงขึ้นชุดใช้งานจริง

## 2. ตั้งค่า Vercel ครั้งแรก

1. เข้า vercel.com ด้วยบัญชี GitHub แล้วกด **Add New > Project** เลือก repository `9_claude` กด **Import**
2. Framework Preset = Next.js (ไฟล์ `vercel.json` ตั้งให้แล้ว: ภูมิภาค `sin1` สิงคโปร์ ใกล้ฐานข้อมูล และตรวจกุญแจลับหลัง build ด้วย `npm run check:secrets` ถ้าพบกุญแจลับในไฟล์ฝั่งเบราว์เซอร์ การ deploy จะล้มเหลวทันที)
3. **Settings > Environment Variables** ตั้งค่า 4 ตัว แยก 2 ชุด (ติ๊ก Environment ให้ตรง):

   | ชื่อ | Production | Preview |
   |---|---|---|
   | `NEXT_PUBLIC_APP_ENV` | `production` | `staging` |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL ของชุดใช้งานจริง | URL ของชุดทดสอบ |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key ชุดใช้งานจริง | Publishable key ชุดทดสอบ |
   | `SUPABASE_SECRET_KEY` (ติ๊ก Sensitive) | Secret key ชุดใช้งานจริง | Secret key ชุดทดสอบ |

   ค่าอยู่ที่ Supabase > Project Settings > Data API (URL) และ API Keys (Publishable / Secret) ห้ามคัดลอกกุญแจลับลงแชตหรืออีเมล
4. **Settings > Deployment Protection**: เปิด Vercel Authentication สำหรับ Preview (ชุดทดสอบเข้าได้เฉพาะสมาชิกทีม)
5. กด **Deploy** รอจนขึ้น Ready แล้วเปิด `https://<ชื่อโครงการ>.vercel.app/api/health` ต้องได้ `"status":"ok"`

## 3. ตั้งค่า Supabase ให้ตรงกับที่อยู่เว็บ (ทั้ง 2 โครงการ)

- **Authentication > URL Configuration**: Site URL = ที่อยู่เว็บของชุดนั้น (เช่น `https://registry.vercel.app`) และ Redirect URLs เพิ่ม `https://ที่อยู่เว็บ/**` (ชุดทดสอบเพิ่ม `https://*-ทีม.vercel.app/**` และ `http://localhost:3002/**`)
- **Authentication > Sign In / Providers > Email**: Minimum password length = 12, เปิด Prevent use of leaked passwords (แผน Pro ขึ้นไป)
- **Authentication > Emails > SMTP Settings**: ชุดใช้งานจริงต้องตั้ง SMTP ของหน่วยงาน (เช่น Google Workspace, Amazon SES) อีเมลในตัวของ Supabase ส่งได้เพียงไม่กี่ฉบับต่อชั่วโมง ไม่พอสำหรับให้ผู้ใช้ตั้งรหัสผ่าน
- **Authentication > Emails > Templates**: แม่แบบ Reset password ให้ลิงก์ชี้ `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/password` (ใช้ได้ทุกเบราว์เซอร์ แม้ผู้ใช้เปิดลิงก์บนเครื่องอื่น)

## 4. ผูกโดเมน (เมื่อได้ชื่อโดเมนแล้ว)

1. Vercel > Settings > Domains > Add ใส่ชื่อโดเมน เช่น `registry.ตัวอย่าง.or.th`
2. ไปที่ผู้ให้บริการโดเมน เพิ่มระเบียน DNS ตามที่ Vercel แสดง (ซับโดเมน = CNAME ไปที่ `cname.vercel-dns.com` / โดเมนหลัก = A record)
3. รอจน Vercel ขึ้น Valid Configuration ใบรับรอง HTTPS ออกให้อัตโนมัติ
4. แก้ Site URL และ Redirect URLs ใน Supabase (ข้อ 3) เป็นโดเมนใหม่ และแก้ URL ในบริการเฝ้าระบบ ([ติดตามระบบ.md](ติดตามระบบ.md))

HTTPS: Vercel เปลี่ยนทุกคำขอ http เป็น https ให้เอง และเว็บส่งหัว `Strict-Transport-Security` (บังคับ HTTPS 2 ปี) กับหัวความปลอดภัยอื่นจาก `next.config.ts` ทุกหน้า

## 5. ปรับปรุงเว็บครั้งต่อไป

1. แก้โค้ดในกิ่งใหม่ > push > Vercel สร้าง Preview (ชุดทดสอบ) ให้อัตโนมัติ > ทดสอบ
2. ถ้ามี migration ใหม่: รันกับชุดทดสอบก่อน (Supabase ชุดทดสอบ > SQL Editor หรือตัวเชื่อมต่อ Supabase ของ Claude) ทดสอบผ่านแล้วจึงรันกับชุดใช้งานจริง ตามลำดับชื่อไฟล์ และห้ามแก้ไฟล์ที่รันไปแล้ว
3. รวมเข้ากิ่ง `main` > Vercel deploy ชุดใช้งานจริง
4. ตรวจ `/api/health` และหน้า ผู้ดูแลระบบ > สถานะระบบ หลัง deploy ทุกครั้ง
5. ย้อนกลับเร่งด่วน: Vercel > Deployments > เลือกรุ่นก่อนหน้า > **Promote to Production** (ย้อนได้เฉพาะโค้ด migration ต้องเขียนไฟล์ใหม่เพื่อแก้)

## 6. เครื่องผู้พัฒนา

`cp .env.example .env.local` แล้วเติมค่าของชุดทดสอบ (ไม่ตั้ง `NEXT_PUBLIC_APP_ENV`) จากนั้น `npm ci` และ `npm run dev` (พอร์ต 3002)
