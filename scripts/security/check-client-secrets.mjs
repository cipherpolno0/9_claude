#!/usr/bin/env node
/**
 * ตรวจว่าไม่มีกุญแจลับในไฟล์ที่ส่งไปเบราว์เซอร์ (บทที่ 31) ใช้หลัง npm run build
 * - ค่าของตัวแปรใน .env.local ที่ไม่ขึ้นต้นด้วย NEXT_PUBLIC_ (เช่น SUPABASE_SECRET_KEY) ต้องไม่ปรากฏ
 * - รูปแบบกุญแจลับของ Supabase (sb_secret_...) และ JWT ที่มี role service_role ต้องไม่ปรากฏ
 * ไล่อ่าน .next/static ทั้งหมด และหน้า HTML ที่สร้างไว้ล่วงหน้าใน .next/server/app
 * ใช้: npm run check:secrets   (ไม่แสดงค่ากุญแจออกจอ แสดงเพียงชื่อตัวแปรและไฟล์ที่พบ)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const secrets = [];
if (existsSync(join(root, ".env.local"))) {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (!m || m[1].startsWith("NEXT_PUBLIC_")) continue;
    if (m[2].length >= 16) secrets.push({ name: m[1], value: m[2] });
  }
}

const patterns = [
  { name: "รูปแบบกุญแจลับ sb_secret_", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "JWT ของ service_role", re: /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g, jwt: true },
];

function* walk(dir, filter) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, filter);
    else if (filter(p)) yield p;
  }
}

const files = [
  ...walk(join(root, ".next", "static"), (p) => /\.(js|css|json|txt|html|map)$/.test(p)),
  ...walk(join(root, ".next", "server", "app"), (p) => /\.(html|rsc|body)$/.test(p)),
];
if (files.length === 0) {
  console.error("ไม่พบไฟล์ใน .next กรุณารัน npm run build ก่อน");
  process.exit(2);
}

const found = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const s of secrets) if (text.includes(s.value)) found.push(`${s.name} อยู่ใน ${f.replace(root + "/", "")}`);
  for (const p of patterns) {
    if (!p.jwt) {
      if (p.re.test(text)) found.push(`${p.name} อยู่ใน ${f.replace(root + "/", "")}`);
      continue;
    }
    for (const m of text.matchAll(p.re)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
        if (payload.role === "service_role") found.push(`${p.name} อยู่ใน ${f.replace(root + "/", "")}`);
      } catch {
        // ไม่ใช่ JWT
      }
    }
  }
}

console.log(`ตรวจ ${files.length} ไฟล์ ตัวแปรลับที่ตรวจ: ${secrets.map((s) => s.name).join(", ") || "(ไม่มี .env.local)"}`);
if (found.length) {
  console.error("พบกุญแจลับในไฟล์ที่ส่งไปเบราว์เซอร์:\n" + found.join("\n"));
  process.exit(1);
}
console.log("ไม่พบกุญแจลับในไฟล์ที่ส่งไปเบราว์เซอร์");
