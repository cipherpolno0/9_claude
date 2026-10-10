"use client";

import { useState } from "react";

export type MonthPoint = {
  label: string;
  /** เบิกจ่ายในเดือน (บาท) */
  disbursed: number;
  /** เบิกจ่ายสะสม (บาท) */
  cumulative: number;
  /** ร้อยละสะสมของวงเงินที่ใช้เอง (null = เดือนที่ยังไม่ถึง) */
  actual: number | null;
  /** เป้าสะสม (null = ยังไม่ตั้งเป้า) */
  target: number | null;
};

// สีของ 2 ชุดข้อมูล ผ่านตัวตรวจจานสีแล้ว (ชุดเดียวกับกราฟพัฒนาการของคลังข้อสอบ) เส้นเป้าเป็นเส้นประด้วยเพื่อไม่พึ่งสีอย่างเดียว
const ACTUAL = { name: "เบิกจ่ายจริงสะสม", color: "#2a78d6" };
const TARGET = { name: "เป้าสะสม", color: "#b8860b" };

const W = 720;
const H = 280;
const PAD = { top: 18, right: 56, bottom: 30, left: 44 };

const money = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;

/**
 * กราฟเส้น: ร้อยละการเบิกจ่ายสะสมรายเดือน (ต.ค.–ก.ย.) เทียบเป้าสะสม แกนเดียว (ร้อยละ)
 * ทุกค่ามีในตารางใต้กราฟด้วย กราฟจึงเป็นส่วนเสริม
 */
export function MonthlyChart({ points }: { points: MonthPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxValue = Math.max(100, ...points.map((p) => p.actual ?? 0), ...points.map((p) => p.target ?? 0));
  const top = Math.ceil(maxValue / 25) * 25;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const actualPts = points.map((p, i) => ({ p, i })).filter((s) => s.p.actual !== null);
  const targetPts = points.map((p, i) => ({ p, i })).filter((s) => s.p.target !== null);
  const lastActual = actualPts[actualPts.length - 1];
  const lastTarget = targetPts[targetPts.length - 1];
  const current = active !== null ? points[active] : null;
  const ticks = Array.from({ length: top / 25 + 1 }, (_, k) => k * 25);

  return (
    <div data-testid="monthly-chart">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="คำอธิบายเส้น">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-6" style={{ background: ACTUAL.color }} />
          {ACTUAL.name}
        </li>
        {targetPts.length ? (
          <li className="flex items-center gap-2">
            <svg aria-hidden width="24" height="4">
              <line x1="0" x2="24" y1="2" y2="2" stroke={TARGET.color} strokeWidth="2" strokeDasharray="5 4" />
            </svg>
            {TARGET.name}
          </li>
        ) : (
          <li className="text-muted-foreground">ยังไม่ได้ตั้งเป้าการเบิกจ่ายของปีนี้ (ผู้ดูแลระบบตั้งที่หน้า ตั้งค่างบประมาณ)</li>
        )}
      </ul>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="กราฟร้อยละการเบิกจ่ายสะสมรายเดือนเทียบเป้า"
          className="h-auto w-full"
          onPointerLeave={() => setActive(null)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const px = ((event.clientX - box.left) / box.width) * W;
            const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1));
            setActive(Math.max(0, Math.min(points.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e4d8c0" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="#5f4d3d">
                {t}%
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="#5f4d3d">
              {p.label}
            </text>
          ))}
          {active !== null ? (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="#cdbb98" strokeWidth={1} />
          ) : null}
          {targetPts.length ? (
            <polyline
              fill="none"
              stroke={TARGET.color}
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinejoin="round"
              points={targetPts.map((s) => `${x(s.i)},${y(s.p.target as number)}`).join(" ")}
            />
          ) : null}
          {actualPts.length ? (
            <polyline
              fill="none"
              stroke={ACTUAL.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={actualPts.map((s) => `${x(s.i)},${y(s.p.actual as number)}`).join(" ")}
            />
          ) : null}
          {actualPts.map((s) => (
            <circle
              key={s.i}
              cx={x(s.i)}
              cy={y(s.p.actual as number)}
              r={active === s.i ? 6 : 4.5}
              fill={ACTUAL.color}
              stroke="#ffffff"
              strokeWidth={2}
              tabIndex={0}
              role="img"
              aria-label={`${s.p.label} เบิกจ่ายสะสม ${pct(s.p.actual as number)}${s.p.target !== null ? ` เป้า ${pct(s.p.target)}` : ""}`}
              onFocus={() => setActive(s.i)}
              onBlur={() => setActive(null)}
              className="outline-none focus-visible:stroke-[#2a190c]"
            />
          ))}
          {/* ป้ายปลายเส้น */}
          {lastActual ? (
            <text x={x(lastActual.i) + 8} y={y(lastActual.p.actual as number) - 8} fontSize={13} fontWeight={600} fill="#2a190c">
              {pct(lastActual.p.actual as number)}
            </text>
          ) : null}
          {lastTarget ? (
            <text x={x(lastTarget.i) + 6} y={y(lastTarget.p.target as number) + 4} fontSize={12} fill="#5f4d3d">
              เป้า {pct(lastTarget.p.target as number)}
            </text>
          ) : null}
        </svg>
        {current ? (
          <div
            role="status"
            data-testid="chart-tooltip"
            className="pointer-events-none absolute top-0 z-10 w-60 rounded-lg border bg-card px-3 py-2 text-sm shadow-md"
            style={(active as number) > (points.length - 1) / 2 ? { left: 0 } : { right: 0 }}
          >
            <p className="font-bold">{current.label}</p>
            <p className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: ACTUAL.color }} />
              สะสม {current.actual === null ? "-" : pct(current.actual)} ({money(current.cumulative)} บาท)
            </p>
            {current.target !== null ? (
              <p className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: TARGET.color }} />
                เป้า {pct(current.target)}
              </p>
            ) : null}
            <p className="text-muted-foreground">เบิกจ่ายในเดือน {money(current.disbursed)} บาท</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
