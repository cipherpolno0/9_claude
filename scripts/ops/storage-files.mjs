// สำรองและกู้คืนไฟล์ในที่เก็บไฟล์ (Supabase Storage) ทุก bucket (บทที่ 32)
// สำรอง:  SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/ops/storage-files.mjs backup <โฟลเดอร์>
// กู้คืน: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/ops/storage-files.mjs restore <โฟลเดอร์>
// ไฟล์ส่วนบุคคล (หนังสือรับรอง ไฟล์สมัครสอบ ไฟล์แนบ) อยู่ในไฟล์สำรองด้วย จึงต้องเข้ารหัสไฟล์สำรองเสมอ (workflow ทำให้)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const [mode, dir] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!["backup", "restore"].includes(mode) || !dir || !url || !key) {
  console.error("ใช้: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/ops/storage-files.mjs backup|restore <โฟลเดอร์>");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`อ่านรายการไฟล์ ${bucket}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || !item.metadata) files.push(...(await listAll(bucket, path)));
      else files.push({ path, size: item.metadata.size ?? 0, mimetype: item.metadata.mimetype ?? "application/octet-stream" });
    }
    if (!data || data.length < 1000) break;
  }
  return files;
}

if (mode === "backup") {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`อ่านรายการ bucket: ${error.message}`);
  const manifest = { buckets: [], files: [] };
  for (const b of buckets) {
    manifest.buckets.push({ name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types });
    const files = await listAll(b.name);
    for (const f of files) {
      const { data, error: dlError } = await supabase.storage.from(b.name).download(f.path);
      if (dlError) throw new Error(`ดาวน์โหลด ${b.name}/${f.path}: ${dlError.message}`);
      const target = join(dir, b.name, f.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await data.arrayBuffer()));
      manifest.files.push({ bucket: b.name, ...f });
    }
    console.log(`${b.name}: ${files.length} ไฟล์`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`สำรองไฟล์แล้ว ${manifest.files.length} ไฟล์`);
} else {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const { data: existing } = await supabase.storage.listBuckets();
  const names = new Set((existing ?? []).map((b) => b.name));
  for (const b of manifest.buckets) {
    if (!names.has(b.name)) {
      const { error } = await supabase.storage.createBucket(b.name, {
        public: b.public,
        fileSizeLimit: b.file_size_limit ?? undefined,
        allowedMimeTypes: b.allowed_mime_types ?? undefined,
      });
      if (error) throw new Error(`สร้าง bucket ${b.name}: ${error.message}`);
    }
  }
  let done = 0;
  for (const f of manifest.files) {
    const body = await readFile(join(dir, f.bucket, f.path));
    const { error } = await supabase.storage.from(f.bucket).upload(f.path, body, { contentType: f.mimetype, upsert: true });
    if (error) throw new Error(`อัปโหลด ${f.bucket}/${f.path}: ${error.message}`);
    done += 1;
  }
  console.log(`กู้คืนไฟล์แล้ว ${done} จาก ${manifest.files.length} ไฟล์`);
}
