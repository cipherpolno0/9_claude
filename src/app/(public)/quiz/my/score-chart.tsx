"use client";

import { useMemo, useState } from "react";

import { selectClass } from "@/components/form";
import { Label } from "@/components/ui/label";

export type ScorePoint = {
  id: string;
  courseId: string;
  kind: "post" | "full";
  /** ชื่อหน่วย หรือ ทดสอบรวมทั้งวิชา */
  label: string;
  percent: number;
  scoreText: string;
  dateText: string;
};

// สีของ 2 ชุดข้อมูล ผ่านการตรวจด้วยตัวตรวจจานสี (แยกออกได้สำหรับผู้ตาบอดสี และตัดกับพื้นขาวเกิน 3:1)
const SERIES = {
  post: { name: "แบบทดสอบหลังเรียน", color: "#b8860b" },
  full: { name: "ทดสอบรวมทั้งวิชา", color: "#2a78d6" },
} as const;

const W = 640;
const H = 260;
const PAD = { top: 16, right: 20, bottom: 34, left: 44 };

/**
 * กราฟพัฒนาการ: คะแนน (ร้อยละ) ของแบบทดสอบหลังเรียนและทดสอบรวม เรียงตามลำดับเวลาที่ทำ ของรายวิชาที่เลือก
 * ค่าทุกค่าในกราฟมีอยู่ในตารางประวัติด้านล่างด้วย กราฟจึงเป็นส่วนเสริม ไม่ใช่ที่เดียวที่เห็นตัวเลข
 */
export function ScoreChart({ points, courses }: { points: ScorePoint[]; courses: { id: string; name: string }[] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [active, setActive] = useState<number | null>(null);
  const shown = useMemo(() => points.filter((p) => p.courseId === courseId), [points, courseId]);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (shown.length <= 1 ? innerW / 2 : (i / (shown.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / 100) * innerH;
  const kinds = (["post", "full"] as const).filter((k) => shown.some((p) => p.kind === k));
  const current = active !== null ? shown[active] : null;

  return (
    <div data-testid="score-chart">
      <div className="flex max-w-xl flex-col gap-1">
        <Label htmlFor="chart-course">รายวิชา</Label>
        <select
          id="chart-course"
          className={selectClass}
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setActive(null);
          }}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-muted-foreground">รายวิชานี้ยังไม่มีผลแบบทดสอบหลังเรียนหรือทดสอบรวม</p>
      ) : (
        <>
          {kinds.length > 1 ? (
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1" aria-label="คำอธิบายเส้น">
              {kinds.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0.5 w-6" style={{ background: SERIES[k].color }} />
                  {SERIES[k].name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground">{SERIES[kinds[0]].name}</p>
          )}

          <div className="relative mt-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`กราฟคะแนนร้อยละตามลำดับการทำ ${shown.length} ครั้ง`}
              className="h-auto w-full"
              onPointerLeave={() => setActive(null)}
              onPointerMove={(event) => {
                // หาจุดที่ใกล้ตำแหน่งชี้ที่สุดตามแนวนอน (ไม่ต้องชี้ให้ตรงจุด)
                const box = event.currentTarget.getBoundingClientRect();
                const px = ((event.clientX - box.left) / box.width) * W;
                let best = 0;
                for (let i = 1; i < shown.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
                setActive(best);
              }}
            >
              {[0, 25, 50, 75, 100].map((tick) => (
                <g key={tick}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e4d8c0" strokeWidth={1} />
                  <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={12} fill="#5f4d3d">
                    {tick}
                  </text>
                </g>
              ))}
              <text x={PAD.left} y={H - 8} fontSize={12} fill="#5f4d3d">
                {shown[0].dateText}
              </text>
              {shown.length > 1 ? (
                <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={12} fill="#5f4d3d">
                  {shown[shown.length - 1].dateText}
                </text>
              ) : null}
              {current ? (
                <line x1={x(active as number)} x2={x(active as number)} y1={PAD.top} y2={PAD.top + innerH} stroke="#cdbb98" strokeWidth={1} />
              ) : null}
              {kinds.map((k) => {
                const series = shown.map((p, i) => ({ p, i })).filter((s) => s.p.kind === k);
                return (
                  <g key={k}>
                    <polyline
                      fill="none"
                      stroke={SERIES[k].color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={series.map((s) => `${x(s.i)},${y(s.p.percent)}`).join(" ")}
                    />
                    {series.map((s) => (
                      <circle
                        key={s.p.id}
                        cx={x(s.i)}
                        cy={y(s.p.percent)}
                        r={active === s.i ? 6 : 4.5}
                        fill={SERIES[k].color}
                        stroke="#ffffff"
                        strokeWidth={2}
                        tabIndex={0}
                        role="img"
                        aria-label={`${SERIES[k].name} ${s.p.label} ${s.p.dateText} ร้อยละ ${s.p.percent}`}
                        onFocus={() => setActive(s.i)}
                        onBlur={() => setActive(null)}
                        className="outline-none focus-visible:stroke-[#2a190c]"
                      />
                    ))}
                  </g>
                );
              })}
              {/* ป้ายค่าเฉพาะจุดล่าสุดของแต่ละเส้น */}
              {kinds.map((k) => {
                const index = shown.map((p) => p.kind).lastIndexOf(k);
                const last = shown[index];
                const nearRight = x(index) > W - PAD.right - 40;
                return (
                  <text
                    key={k}
                    x={x(index) + (nearRight ? -8 : 8)}
                    y={y(last.percent) - 8}
                    textAnchor={nearRight ? "end" : "start"}
                    fontSize={13}
                    fontWeight={600}
                    fill="#2a190c"
                  >
                    {last.percent}%
                  </text>
                );
              })}
            </svg>
            {current ? (
              <div
                role="status"
                data-testid="chart-tooltip"
                className="pointer-events-none absolute top-0 z-10 w-56 rounded-lg border bg-card px-3 py-2 text-sm shadow-md"
                style={(active as number) > (shown.length - 1) / 2 ? { left: 0 } : { right: 0 }}
              >
                <p className="text-lg font-bold">
                  {current.percent}% <span className="text-sm font-normal text-muted-foreground">({current.scoreText})</span>
                </p>
                <p className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: SERIES[current.kind].color }} />
                  {SERIES[current.kind].name}
                </p>
                <p className="text-muted-foreground">{current.label}</p>
                <p className="text-muted-foreground">{current.dateText}</p>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            แกนตั้ง = คะแนนเป็นร้อยละ แกนนอน = ลำดับการทำ จากเก่าไปใหม่ ({shown.length.toLocaleString("th-TH")} ครั้ง)
            ชี้หรือแตะที่กราฟเพื่อดูรายละเอียด ตัวเลขทั้งหมดอยู่ในตารางประวัติด้านล่าง
          </p>
        </>
      )}
    </div>
  );
}
