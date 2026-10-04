"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRACKS, TRACK_LABEL, type EducationPositionType, type Track } from "@/lib/education";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { addEducationPositionType, updateEducationPositionType } from "./actions";

export function PositionTypeManager({ types }: { types: EducationPositionType[] }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [names, setNames] = useState(() => Object.fromEntries(types.map((t) => [t.id, t.name])));
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await fn();
      if (result.ok) {
        setFlash(result.message ?? null);
        after?.();
      } else setError(result.error);
    });

  const add = (track: Track) => {
    const list = types.filter((t) => t.track === track);
    const nextOrder = (list.length ? Math.max(...list.map((t) => t.sort_order)) : 0) + 10;
    run(
      () => addEducationPositionType(track, newNames[track] ?? "", nextOrder),
      () => setNewNames((v) => ({ ...v, [track]: "" })),
    );
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>

      {TRACKS.map((track) => {
        const list = types.filter((t) => t.track === track);
        return (
          <div key={track} className="rounded-xl border bg-card p-5" data-testid={`track-${track}`}>
            <h2 className="text-xl font-bold text-primary">{TRACK_LABEL[track]}</h2>
            {list.length === 0 ? (
              <p className="mt-2 text-muted-foreground">ยังไม่มีประเภทตำแหน่งในแท่งนี้</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => updateEducationPositionType(t.id, { name: names[t.id] ?? t.name }));
                      }}
                    >
                      <Input
                        aria-label={`ชื่อประเภทตำแหน่ง: ${t.name}`}
                        className={cn("min-w-48 flex-1", !t.is_active && "text-muted-foreground line-through")}
                        value={names[t.id] ?? t.name}
                        onChange={(e) => setNames((v) => ({ ...v, [t.id]: e.target.value }))}
                      />
                      <Button type="submit" variant="outline" disabled={pending || (names[t.id] ?? t.name) === t.name}>
                        บันทึกชื่อ
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => updateEducationPositionType(t.id, { isActive: !t.is_active }))}
                      >
                        {t.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                add(track);
              }}
            >
              <label className="flex min-w-48 flex-1 flex-col gap-1 font-semibold">
                เพิ่มประเภทตำแหน่งใน{TRACK_LABEL[track]}
                <Input
                  className="font-normal"
                  value={newNames[track] ?? ""}
                  onChange={(e) => setNewNames((v) => ({ ...v, [track]: e.target.value }))}
                />
              </label>
              <Button type="submit" disabled={pending || !(newNames[track] ?? "").trim()}>
                เพิ่ม
              </Button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
