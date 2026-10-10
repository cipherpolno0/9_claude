import "server-only";

import { fetchExamRounds } from "@/lib/exam-forms-server";
import { formParam, type ListForm } from "@/lib/exam-lists";
import { fetchListForms, findForm, isUuid } from "@/lib/exam-lists-server";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

export function read(raw: Raw, key: string): string {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** ปีที่มีรอบสมัครสอบ (ล่าสุดก่อน) */
export async function fetchListYears(): Promise<number[]> {
  const rounds = await fetchExamRounds();
  return [...new Set(rounds.filter((r) => r.status !== "draft").map((r) => r.year_be))].sort((a, b) => b - a);
}

export type ListParams = {
  years: number[];
  forms: ListForm[];
  year: number | null;
  form: ListForm | null;
  unit: string | null;
  place: string | null;
  venue: string | null;
};

/** อ่านเงื่อนไขบัญชีรายชื่อจากที่อยู่หน้าเว็บ (?year= &form= &unit= &place= &venue=) ใช้ร่วมกันทั้งหน้าจอและหน้าพิมพ์ */
export async function readListParams(raw: Raw): Promise<ListParams> {
  const [years, forms] = await Promise.all([fetchListYears(), fetchListForms()]);
  const y = Number(read(raw, "year"));
  const year = years.includes(y) ? y : (years[0] ?? null);
  const form = findForm(forms, read(raw, "form")) ?? forms[0] ?? null;
  const pick = (k: string) => (isUuid(read(raw, k)) ? read(raw, k) : null);
  return { years, forms, year, form, unit: pick("unit"), place: pick("place"), venue: pick("venue") };
}

export function listQuery(p: { year: number | null; form: ListForm | null; unit?: string | null; place?: string | null; venue?: string | null }) {
  const q = new URLSearchParams();
  if (p.year) q.set("year", String(p.year));
  if (p.form) q.set("form", formParam(p.form));
  if (p.unit) q.set("unit", p.unit);
  if (p.place) q.set("place", p.place);
  if (p.venue) q.set("venue", p.venue);
  return q.toString();
}
