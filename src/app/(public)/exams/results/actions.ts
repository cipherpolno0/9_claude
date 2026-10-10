"use server";

import type { PublicPasser, PublicResultPlace, PublicResultSearch } from "@/lib/exam-results";
import { fetchPublicResultList, fetchPublicResultPlaces, searchPublicResults } from "@/lib/exam-results-server";

type Choice = { year: number; type: string; level: string };
const choice = (c: Choice) => ({ year: Number(c?.year) || 0, type: String(c?.type ?? ""), level: String(c?.level ?? "") });

/** ค้นผลสอบด้วยชื่อ (จำกัดจำนวนครั้งต่อนาทีที่ฐานข้อมูล) */
export async function searchResults(input: Choice & { first: string; last: string }): Promise<PublicResultSearch> {
  const c = choice(input);
  return searchPublicResults({ ...c, first: String(input?.first ?? "").slice(0, 120), last: String(input?.last ?? "").slice(0, 120) });
}

/** จังหวัดและสำนักที่มีผู้สอบได้ (แคช 5 นาที) */
export async function loadResultPlaces(input: Choice): Promise<PublicResultPlace[]> {
  const c = choice(input);
  return fetchPublicResultPlaces(c.year, c.type, c.level);
}

/** ผู้สอบได้ของสำนัก (แคช 5 นาที) */
export async function loadResultList(input: Choice & { place: string }): Promise<PublicPasser[]> {
  const c = choice(input);
  return fetchPublicResultList(c.year, c.type, c.level, String(input?.place ?? ""));
}
