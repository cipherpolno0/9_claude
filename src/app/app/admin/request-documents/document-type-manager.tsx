"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/errors";
import {
  PLACE_REQUEST_TITLE,
  PLACE_REQUEST_TYPES,
  type PlaceRequestType,
  type RequestDocumentType,
} from "@/lib/place-requests";
import { cn } from "@/lib/utils";

import { addRequestDocumentType, updateRequestDocumentType } from "./actions";

const typeTitle = (type: PlaceRequestType) => `คำ${PLACE_REQUEST_TITLE[type]}`;

export function DocumentTypeManager({ types }: { types: RequestDocumentType[] }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [newRequired, setNewRequired] = useState<Record<string, boolean>>({});
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

  return (
    <div className="mt-6 flex flex-col gap-6">
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>

      {PLACE_REQUEST_TYPES.map((typeKey) => {
        const list = types.filter((t) => t.type_key === typeKey);
        const nextOrder = (list.length ? Math.max(...list.map((t) => t.sort_order)) : 0) + 10;
        const required = newRequired[typeKey] ?? true;
        return (
          <div key={typeKey} className="rounded-xl border bg-card p-5" data-testid={`doc-types-${typeKey}`}>
            <h2 className="text-xl font-bold text-primary">{typeTitle(typeKey)}</h2>
            {list.length === 0 ? (
              <p className="mt-2 text-muted-foreground">
                ยังไม่มีรายการเอกสาร ผู้ยื่นแนบเอกสารประกอบได้อิสระ และผู้พิจารณาเห็นชอบได้โดยไม่ตรวจเอกสาร
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {list.map((t, index) => (
                  <li key={t.id} className="rounded-lg border p-3" data-testid="doc-type-row">
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => updateRequestDocumentType(t.id, { name: names[t.id] ?? t.name }));
                      }}
                    >
                      <span className="w-6 text-muted-foreground">{index + 1}.</span>
                      <Input
                        aria-label={`ชื่อเอกสาร: ${t.name}`}
                        className={cn("min-w-48 flex-1", !t.is_active && "text-muted-foreground line-through")}
                        value={names[t.id] ?? t.name}
                        maxLength={200}
                        onChange={(e) => setNames((v) => ({ ...v, [t.id]: e.target.value }))}
                      />
                      <Button type="submit" variant="outline" disabled={pending || (names[t.id] ?? t.name) === t.name}>
                        บันทึกชื่อ
                      </Button>
                    </form>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-5"
                          checked={t.is_required}
                          disabled={pending || !t.is_active}
                          onChange={(e) => run(() => updateRequestDocumentType(t.id, { isRequired: e.target.checked }))}
                        />
                        ต้องแนบ
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending || index === 0}
                        aria-label={`เลื่อน ${t.name} ขึ้น`}
                        onClick={() =>
                          run(async () => {
                            const prev = list[index - 1];
                            const first = await updateRequestDocumentType(t.id, { sortOrder: prev.sort_order });
                            if (!first.ok) return first;
                            return updateRequestDocumentType(prev.id, {
                              sortOrder: t.sort_order === prev.sort_order ? prev.sort_order + 1 : t.sort_order,
                            });
                          })
                        }
                      >
                        เลื่อนขึ้น
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => updateRequestDocumentType(t.id, { isActive: !t.is_active }))}
                      >
                        {t.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </Button>
                      {!t.is_active ? <span className="text-sm text-muted-foreground">ปิดใช้งานอยู่</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () => addRequestDocumentType(typeKey, newNames[typeKey] ?? "", required, nextOrder),
                  () => setNewNames((v) => ({ ...v, [typeKey]: "" })),
                );
              }}
            >
              <label className="flex min-w-48 flex-1 flex-col gap-1 font-semibold">
                เพิ่มเอกสาร
                <Input
                  className="font-normal"
                  maxLength={200}
                  value={newNames[typeKey] ?? ""}
                  onChange={(e) => setNewNames((v) => ({ ...v, [typeKey]: e.target.value }))}
                />
              </label>
              <label className="flex h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={required}
                  onChange={(e) => setNewRequired((v) => ({ ...v, [typeKey]: e.target.checked }))}
                />
                ต้องแนบ
              </label>
              <Button type="submit" disabled={pending || !(newNames[typeKey] ?? "").trim()}>
                เพิ่ม
              </Button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
