import Link from "next/link";
import { BarChart3, ClipboardList, Network, SearchCheck } from "lucide-react";

import { countPendingPersonnelRequests, fetchPersonnelCounts } from "@/lib/reports-server";

/** แดชบอร์ดบุคลากร: จำนวนตามตำแหน่งและแท่ง จำนวนคำขอค้างพิจารณา และทางลัดไปหน้าตรวจสอบ ผัง รายงาน */
export async function PersonnelDashboard() {
  const [counts, pending] = await Promise.all([fetchPersonnelCounts(), countPendingPersonnelRequests()]);
  const positions = counts.filter((c) => c.grp === "position");
  const tracks = counts.filter((c) => c.grp === "track");
  const sum = (items: typeof counts) => items.reduce((s, c) => s + c.total, 0);

  const shortcuts = [
    { href: "/app/personnel/lookup", title: "ตรวจสอบบุคลากร", text: "ค้นและดูเส้นเวลาสถานะ", icon: SearchCheck },
    { href: "/app/personnel/chart", title: "ผังสายการปกครอง", text: "ผู้ดำรงตำแหน่งและตำแหน่งว่าง", icon: Network },
    { href: "/app/personnel/reports", title: "รายงาน", text: "ส่งออก Excel และหน้าพิมพ์", icon: BarChart3 },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4" data-testid="personnel-dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/app/personnel/requests?f_status=pending"
          className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary"
          data-testid="pending-card"
        >
          <ClipboardList className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block text-sm text-muted-foreground">คำขอค้างพิจารณา</span>
            <span className="block text-2xl font-bold text-primary">{pending.toLocaleString("th-TH")}</span>
          </span>
        </Link>
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
            <s.icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold text-primary">{s.title}</span>
              <span className="block text-sm text-muted-foreground">{s.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 lg:col-span-2" data-testid="count-positions">
          <h2 className="font-bold text-primary">
            ผู้ดำรงตำแหน่งปกครอง <span className="font-normal text-muted-foreground">รวม {sum(positions).toLocaleString("th-TH")}</span>
          </h2>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((c) => (
              <li key={c.key} className="flex justify-between gap-3 border-b border-dashed py-1">
                <span>{c.label}</span>
                <span className="font-semibold">{c.total.toLocaleString("th-TH")}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4" data-testid="count-tracks">
          <h2 className="font-bold text-primary">
            จศป. ตามแท่ง <span className="font-normal text-muted-foreground">รวม {sum(tracks).toLocaleString("th-TH")}</span>
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {tracks.map((c) => (
              <li key={c.key} className="flex justify-between gap-3 border-b border-dashed py-1">
                <Link href={`/app/personnel/education?track=${c.key}`} className="text-primary underline underline-offset-4">
                  {c.label}
                </Link>
                <span className="font-semibold">{c.total.toLocaleString("th-TH")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">ตัวเลขนับเฉพาะเขตที่ท่านมีสิทธิ์ดู ณ วันนี้</p>
    </div>
  );
}
