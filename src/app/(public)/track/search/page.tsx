import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorText } from "@/components/form";
import { LEVEL_LABEL } from "@/lib/org-units";
import { PLACE_REQUEST_LABEL, isPlaceRequestType, requestKindLabel } from "@/lib/place-requests";
import { fetchPublicProvinces } from "@/lib/registry-server";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { thaiDate } from "@/lib/thai";
import { TRACK_PAGE_SIZE } from "@/lib/track";
import { fetchPublicRequestStatus, fetchPublicRequestYears, queryPublicRequests } from "@/lib/track-server";

import { TrackForms } from "../track-forms";

export const metadata: Metadata = { title: "ผลการค้นหาคำขอ" };

export default async function TrackSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (key: string) => {
    const v = raw[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  const no = one("no").slice(0, 30);

  // ค้นด้วยเลขที่คำขอ: พบแล้วไปหน้าเส้นเวลาของคำขอนั้น
  if (no) {
    const found = await fetchPublicRequestStatus(no);
    if (found) redirect(`/track/${encodeURIComponent(found.request_no)}`);
  }

  const [provinces, years] = await Promise.all([fetchPublicProvinces(), fetchPublicRequestYears()]);
  const type = isPlaceRequestType(one("type")) ? one("type") : null;
  const province = /^\d{1,2}$/.test(one("province")) ? Number(one("province")) : null;
  const year = /^\d{4}$/.test(one("year")) ? Number(one("year")) : (years[0] ?? null);
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  const result = no ? null : await queryPublicRequests({ type, province, year }, page);
  const pages = result ? Math.max(1, Math.ceil(result.total / TRACK_PAGE_SIZE)) : 1;
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    if (province !== null) q.set("province", String(province));
    if (year !== null) q.set("year", String(year));
    if (p > 1) q.set("page", String(p));
    return `/track/search?${q.toString()}`;
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/track" className="text-primary underline underline-offset-4">
          ← ติดตามคำขอ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ผลการค้นหาคำขอ</h1>

      {no ? (
        <div className="mt-4" data-testid="track-not-found">
          <ErrorText>
            ไม่พบคำขอเลขที่ {no.toUpperCase()} กรุณาตรวจเลขที่อีกครั้ง (รูปแบบ เช่น ESTAB-2569-0001) หรือค้นจากชนิดคำขอ จังหวัด และปี
          </ErrorText>
        </div>
      ) : null}

      <div className="mt-6">
        <TrackForms
          provinces={provinces}
          years={years}
          values={{ no, type: type ?? "", province: province === null ? "" : String(province), year: year === null ? "" : String(year) }}
        />
      </div>

      {result ? (
        <div className="mt-8" data-testid="track-results">
          {result.failed ? <ErrorText>อ่านข้อมูลไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง</ErrorText> : null}
          <p className="text-muted-foreground">
            พบ {result.total.toLocaleString("th-TH")} รายการ
            {year !== null ? ` ที่ยื่นในปี ${year}` : ""}
          </p>
          {result.rows.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-3">
              {result.rows.map((r) => (
                <li key={r.request_no} className="rounded-xl border bg-card p-4" data-testid="track-row">
                  <p className="font-semibold">
                    <Link
                      href={`/track/${encodeURIComponent(r.request_no)}`}
                      prefetch={false}
                      className="text-primary underline underline-offset-4"
                    >
                      {r.request_no}
                    </Link>{" "}
                    · {r.subject_name ?? "-"}
                  </p>
                  <p>
                    {isPlaceRequestType(r.type_key) ? PLACE_REQUEST_LABEL[r.type_key] : r.type_name}
                    {requestKindLabel(r.kind)}
                    {r.place_name ? ` · ${r.place_name}` : ""}
                    {r.province_name ? ` · ${r.province_name}` : ""}
                    {r.region_name ? ` · ${r.region_name}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    ยื่นเมื่อ {thaiDate(r.submitted_at, "short")} ·{" "}
                    <span className="font-semibold text-foreground">{REQUEST_STATUS_LABEL[r.status]}</span>
                    {r.status === "pending" && r.current_step
                      ? ` · ขั้นที่ ${r.current_step} จาก ${r.step_count}${r.current_level ? ` (${LEVEL_LABEL[r.current_level]} · ${r.current_unit_name ?? ""})` : ""}`
                      : ""}
                    {r.decided_at ? ` · ได้ผลเมื่อ ${thaiDate(r.decided_at, "short")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground">ไม่พบคำขอตามเงื่อนไขนี้</p>
          )}
          {pages > 1 ? (
            <nav aria-label="หน้า" className="mt-4 flex flex-wrap items-center gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} prefetch={false} className="text-primary underline underline-offset-4">
                  ← ก่อนหน้า
                </Link>
              ) : null}
              <span>
                หน้า {page} / {pages}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} prefetch={false} className="text-primary underline underline-offset-4">
                  ถัดไป →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
