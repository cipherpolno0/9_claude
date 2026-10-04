"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * ช่องเลือกรายการด้วยการค้นหา (เช่น เลือกบุคคล หรือเลือกวัด) ค่าที่ส่งกับฟอร์ม (name) คือรหัสของรายการที่เลือก
 * search = ฟังก์ชันฝั่งเซิร์ฟเวอร์ที่ค้นในนามผู้ใช้ จึงเห็นเฉพาะรายการที่ผู้ใช้มีสิทธิ์ดู
 */
export type PickerItem<T = unknown> = { id: string; label: string; detail?: string; data?: T };

export function SearchPicker<T>({
  name,
  label,
  placeholder,
  initial = null,
  search,
  onPick,
  required = false,
  hint,
}: {
  name: string;
  label: string;
  placeholder: string;
  initial?: PickerItem<T> | null;
  search: (q: string) => Promise<PickerItem<T>[]>;
  onPick?: (item: PickerItem<T> | null) => void;
  required?: boolean;
  hint?: string;
}) {
  const [picked, setPicked] = useState<PickerItem<T> | null>(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerItem<T>[] | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `${name}-search`;

  const run = () => {
    const term = q.trim();
    if (term.length < 2) return;
    startTransition(async () => setResults(await search(term)));
  };
  const choose = (item: PickerItem<T> | null) => {
    setPicked(item);
    setResults(null);
    setQ("");
    onPick?.(item);
  };

  return (
    <div className="flex flex-col gap-1" data-testid={`picker-${name}`}>
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-muted px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{picked.label}</span>
            {picked.detail ? <span className="block text-sm text-muted-foreground">{picked.detail}</span> : null}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => choose(null)}>
            <X aria-hidden />
            เปลี่ยน
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              id={inputId}
              type="search"
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={run} disabled={pending || q.trim().length < 2}>
              <Search aria-hidden />
              ค้นหา
            </Button>
          </div>
          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่พบรายการที่ตรงกับคำค้น</p>
            ) : (
              <ul className="max-h-60 overflow-y-auto rounded-md border" aria-label={`ผลการค้นหา ${label}`}>
                {results.map((item) => (
                  <li key={item.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => choose(item)}
                      className="block w-full px-3 py-2 text-left hover:bg-secondary"
                    >
                      <span className="font-semibold">{item.label}</span>
                      {item.detail ? <span className="block text-sm text-muted-foreground">{item.detail}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      )}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
