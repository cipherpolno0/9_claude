"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * ตารางข้อมูลกลาง: ค้นหา กรอง เรียง แบ่งหน้า ส่งออก Excel
 * เงื่อนไขทั้งหมดเก็บในที่อยู่หน้าเว็บ หน้าเซิร์ฟเวอร์อ่านด้วย parseTableParams แล้วส่งแถวของหน้านั้นมาให้
 */

export type DataTableColumn = {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
};

export type DataTableFilter = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** ตัวกรองอื่นที่ต้องล้างค่าเมื่อตัวกรองนี้เปลี่ยน เช่น เปลี่ยนจังหวัดแล้วล้างอำเภอและตำบล */
  clears?: string[];
};

export type DataTableRow = { id: string; cells: React.ReactNode[] };

export function DataTable({
  columns,
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  q,
  filters = [],
  filterValues = {},
  searchPlaceholder = "ค้นหา",
  exportHref,
  emptyText = "ไม่พบข้อมูล",
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  q: string;
  filters?: DataTableFilter[];
  filterValues?: Record<string, string>;
  searchPlaceholder?: string;
  /** เส้นทางส่งออก Excel (ระบบจะต่อเงื่อนไขปัจจุบันให้เอง) */
  exportHref?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);
  const [pending, startTransition] = useTransition();

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const toggleSort = (key: string) => {
    if (sort === key) update({ sort: key, dir: dir === "asc" ? "desc" : "asc" });
    else update({ sort: key, dir: "asc" });
  };

  const exportUrl = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    return `${exportHref}?${next.toString()}`;
  };

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <form
          role="search"
          className="relative min-w-48 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: query.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value === "" && q) update({ q: null });
            }}
            className="pl-10"
          />
        </form>
        {filters.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm font-semibold">
            {f.label}
            <select
              className={cn(selectClass, "min-w-36 font-normal")}
              data-filter={f.name}
              value={filterValues[f.name] ?? ""}
              onChange={(e) =>
                update({
                  ...Object.fromEntries((f.clears ?? []).map((name) => [`f_${name}`, null])),
                  [`f_${f.name}`]: e.target.value || null,
                })
              }
            >
              <option value="">ทั้งหมด</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {exportHref ? (
          <Button asChild variant="outline" className="ml-auto">
            <a href={exportUrl()}>
              <Download aria-hidden />
              ส่งออก Excel
            </a>
          </Button>
        ) : null}
      </div>

      <div className={cn("overflow-x-auto rounded-xl border bg-card", pending && "opacity-60")}>
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead className="bg-muted">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("border-b px-3 py-2 font-semibold whitespace-nowrap", c.className)}
                  aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="flex items-center gap-1 rounded hover:underline"
                    >
                      {c.header}
                      {sort === c.key ? (
                        dir === "asc" ? (
                          <ArrowUp className="size-4" aria-hidden />
                        ) : (
                          <ArrowDown className="size-4" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-b-0 hover:bg-muted/60">
                  {row.cells.map((cell, i) => (
                    <td key={columns[i]?.key ?? i} className={cn("px-3 py-2", columns[i]?.className)}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground" data-testid="table-summary">
          แสดง {first.toLocaleString("th-TH")}–{last.toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} รายการ
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => update({ page: String(page - 1) }, false)}
          >
            <ChevronLeft aria-hidden />
            ก่อนหน้า
          </Button>
          <span>
            หน้า {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || pending}
            onClick={() => update({ page: String(page + 1) }, false)}
          >
            ถัดไป
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
