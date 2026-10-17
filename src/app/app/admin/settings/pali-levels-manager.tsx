"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXAM_LEVEL_LABEL, EXAM_TYPE_LABEL } from "@/lib/exam-forms";
import { PALI_TRACK_DHAMMA, PALI_TRACK_LABEL, PALI_TRACKS, type PaliLevel } from "@/lib/pali";
import { VENUE_LEVELS } from "@/lib/venues";

import { updatePaliLevel } from "./actions";

type Draft = { name: string; sortOrder: string; prerequisite: string; dhammaMinLevel: string };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** ชั้นประโยคบาลี: แก้ชื่อที่แสดง ลำดับ ชั้นที่ต้องสอบได้ก่อน และวุฒิแผนกธรรมขั้นต่ำ (เพิ่มหรือลบชั้นไม่ได้) */
export function PaliLevelsManager({ levels }: { levels: PaliLevel[] }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      levels.map((l) => [
        l.code,
        {
          name: l.name,
          sortOrder: String(l.sort_order),
          prerequisite: l.prerequisite_level ?? "",
          dhammaMinLevel: l.dhamma_min_level ?? "",
        },
      ]),
    ),
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (code: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], ...patch } }));

  const save = (code: string) => {
    const d = drafts[code];
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await updatePaliLevel(code, {
        name: d.name,
        sortOrder: Number(d.sortOrder),
        prerequisite: d.prerequisite || null,
        dhammaMinLevel: d.dhammaMinLevel || null,
      });
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });
  };

  return (
    <div className="mt-6 rounded-xl border bg-card p-5" data-testid="pali-levels">
      <h2 className="text-xl font-bold text-primary">ชั้นประโยคบาลี</h2>
      <p className="text-muted-foreground">
        ใช้กับระบบสมัครสอบ ผลสอบ สนามสอบ และคลังข้อสอบแผนกบาลี แก้ชื่อที่แสดง ลำดับ และคุณสมบัติผู้สมัครได้ (เพิ่มหรือลบชั้นไม่ได้)
        วุฒิแผนกธรรมเป็นขั้นต่ำ ผู้ที่สอบได้ชั้นสูงกว่าถือว่าผ่าน
      </p>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>

      {PALI_TRACKS.map((track) => {
        const rows = levels.filter((l) => l.track === track);
        const dhammaType = EXAM_TYPE_LABEL[PALI_TRACK_DHAMMA[track]];
        return (
          <div key={track} className="mt-5">
            <h3 className="text-lg font-semibold">{PALI_TRACK_LABEL[track]}</h3>
            <p className="text-sm text-muted-foreground">วุฒิแผนกธรรมของสายนี้คือ {dhammaType}</p>
            <ul className="mt-2 flex flex-col">
              {rows.map((l) => {
                const d = drafts[l.code];
                const id = `pali-${l.code}`;
                return (
                  <li key={l.code} className="border-b py-3 last:border-b-0" data-testid="pali-level" data-code={l.code}>
                    <form
                      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem] lg:grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-end"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(l.code);
                      }}
                    >
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">ชื่อชั้น</span>
                        <Input id={`${id}-name`} value={d.name} maxLength={60} required onChange={(e) => change(l.code, { name: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">ลำดับ</span>
                        <Input
                          id={`${id}-order`}
                          type="number"
                          min={1}
                          max={999}
                          value={d.sortOrder}
                          required
                          onChange={(e) => change(l.code, { sortOrder: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">ต้องสอบได้ชั้นบาลีก่อน</span>
                        <select
                          id={`${id}-prereq`}
                          className={selectClass}
                          value={d.prerequisite}
                          onChange={(e) => change(l.code, { prerequisite: e.target.value })}
                        >
                          <option value="">ไม่มี</option>
                          {rows
                            .filter((o) => o.code !== l.code)
                            .map((o) => (
                              <option key={o.code} value={o.code}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">วุฒิ{dhammaType}ขั้นต่ำ</span>
                        <select
                          id={`${id}-dhamma`}
                          className={selectClass}
                          value={d.dhammaMinLevel}
                          onChange={(e) => change(l.code, { dhammaMinLevel: e.target.value })}
                        >
                          <option value="">ไม่กำหนด</option>
                          {VENUE_LEVELS.map((v) => (
                            <option key={v} value={v}>
                              {dhammaType}
                              {EXAM_LEVEL_LABEL[v]}ขึ้นไป
                            </option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <Button type="submit" variant="outline" disabled={pending} className="w-full lg:w-auto">
                          บันทึก
                        </Button>
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
