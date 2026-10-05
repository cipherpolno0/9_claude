"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { PositionType } from "@/lib/persons";

import { setPositionLimit, setRoleMfa, updateSetting } from "./actions";

export type RoleRow = { key: string; name: string; requires_org_unit: boolean; mfa_required: boolean };
export type SettingRow = { key: string; value_int: number; description: string };

export function SettingsManager({
  roles,
  settings,
  positions,
}: {
  roles: RoleRow[];
  settings: SettingRow[];
  positions: PositionType[];
}) {
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(positions.map((p) => [p.key, p.max_per_unit === null ? "" : String(p.max_per_unit)])),
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState(() => Object.fromEntries(settings.map((s) => [s.key, String(s.value_int)])));
  // สถานะติ๊กบนจอ เปลี่ยนทันทีที่กด แล้วย้อนกลับถ้าบันทึกไม่สำเร็จ
  const [mfa, setMfa] = useState(() => Object.fromEntries(roles.map((r) => [r.key, r.mfa_required])));
  const [pending, startTransition] = useTransition();

  const toggleMfa = (key: string, required: boolean) => {
    setMfa((m) => ({ ...m, [key]: required }));
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await setRoleMfa(key, required);
      if (result.ok) setFlash(result.message ?? null);
      else {
        setMfa((m) => ({ ...m, [key]: !required }));
        setError(result.error);
      }
    });
  };

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await fn();
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });

  return (
    <div className="mt-6 flex flex-col gap-6">
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">บทบาท</h2>
        <p className="text-muted-foreground">ติ๊กบทบาทที่ต้องยืนยันตัวตน 2 ขั้นก่อนเข้าพื้นที่ทำงาน</p>
        <ul className="mt-3 flex flex-col">
          {roles.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-b-0">
              <span>
                <span className="font-semibold">{r.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {r.requires_org_unit ? "ผูกกับเขตปกครอง" : "ไม่ผูกกับเขตปกครอง"}
                </span>
              </span>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={mfa[r.key] ?? false}
                  disabled={pending || r.key === "admin"}
                  onChange={(e) => toggleMfa(r.key, e.target.checked)}
                  aria-label={`บังคับยืนยันตัวตน 2 ขั้น: ${r.name}`}
                />
                บังคับ 2 ขั้น
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold text-primary">ค่าตั้ง (ตัวเลข)</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {settings.map((s) => (
            <li key={s.key}>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => updateSetting(s.key, Number(values[s.key])));
                }}
              >
                <label htmlFor={`setting-${s.key}`} className="min-w-0 flex-1 font-medium">
                  {s.description}
                </label>
                <Input
                  id={`setting-${s.key}`}
                  type="number"
                  min={1}
                  max={3650}
                  className="w-28"
                  value={values[s.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                  required
                />
                <Button type="submit" variant="outline" disabled={pending}>
                  บันทึก
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-card p-5" data-testid="position-limits">
        <h2 className="text-xl font-bold text-primary">จำนวนตำแหน่งปกครองต่อหน่วย</h2>
        <p className="text-muted-foreground">
          จำนวนสูงสุดที่ดำรงตำแหน่งได้ในหน่วยเดียวกันในเวลาเดียวกัน เว้นว่าง = ไม่จำกัด (ตำแหน่งเจ้าคณะมีได้ 1 รูปเสมอ)
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {positions.map((p) => (
            <li key={p.key}>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const raw = (limits[p.key] ?? "").trim();
                  run(() => setPositionLimit(p.key, raw === "" ? null : Number(raw)));
                }}
              >
                <label htmlFor={`limit-${p.key}`} className="min-w-0 flex-1 font-medium">
                  {p.name}
                </label>
                <Input
                  id={`limit-${p.key}`}
                  type="number"
                  min={1}
                  max={99}
                  placeholder="ไม่จำกัด"
                  className="w-32"
                  value={limits[p.key] ?? ""}
                  disabled={p.kind === "chief"}
                  onChange={(e) => setLimits((v) => ({ ...v, [p.key]: e.target.value }))}
                />
                <Button type="submit" variant="outline" disabled={pending || p.kind === "chief"}>
                  บันทึก
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
