/** ทะเบียนสาธารณะ (เมนู ทะเบียน): ชนิดของทะเบียน ที่อยู่หน้าเว็บ และป้ายชื่อ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

import type { PlaceType } from "@/lib/places";

export const REGISTRY_KINDS = [
  { slug: "samnak-rian", title: "สำนักเรียน", placeType: "samnak_rian", description: "สำนักเรียนพระปริยัติธรรมและวัดที่ตั้ง" },
  { slug: "samnak-sasanasuksa", title: "สำนักศาสนศึกษา", placeType: "samnak_sasanasuksa", description: "สำนักศาสนศึกษาและวัดที่ตั้ง" },
  { slug: "temples", title: "วัด", placeType: "temple", description: "ทะเบียนวัด ที่ตั้ง และโทรศัพท์สำนักงาน" },
  { slug: "schools", title: "สถานศึกษา", placeType: "school", description: "สถานศึกษาที่เกี่ยวข้องกับการสอบธรรมศึกษา" },
  { slug: "organizations", title: "องค์กร", placeType: "organization", description: "องค์กรและหน่วยงานที่เกี่ยวข้อง" },
  { slug: "venues", title: "สนามสอบ", placeType: null, description: "สนามสอบนักธรรมและธรรมศึกษา ที่ตั้ง และชั้นที่เปิดสอบ" },
] as const satisfies readonly { slug: string; title: string; placeType: PlaceType | null; description: string }[];

export type RegistryKind = (typeof REGISTRY_KINDS)[number];
export type RegistrySlug = RegistryKind["slug"];

export const REGISTRY_BASE = "/registry";

export function findRegistryKind(slug: string): RegistryKind | null {
  return REGISTRY_KINDS.find((k) => k.slug === slug) ?? null;
}

export function registrySlugOfPlaceType(type: string): RegistrySlug {
  return (REGISTRY_KINDS.find((k) => k.placeType === type)?.slug ?? "temples") as RegistrySlug;
}

/** จำนวนแถวสูงสุดต่อการส่งออก Excel หนึ่งครั้งของหน้าสาธารณะ (ตรงกับเพดานในฟังก์ชัน public_places / public_venues) */
export const PUBLIC_EXPORT_LIMIT = 5000;
/** อายุแคชของข้อมูลหน้าสาธารณะ (วินาที) */
export const PUBLIC_CACHE_SECONDS = 300;
/** ป้ายแคชของทะเบียนสาธารณะ: เรียก revalidateTag(REGISTRY_TAG, { expire: 0 }) เมื่อแก้ไขสถานที่หรือสนามสอบ */
export const REGISTRY_TAG = "registry";
