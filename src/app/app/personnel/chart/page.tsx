import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { LEVEL_LABEL, type OrgLevel } from "@/lib/org-units";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import type { GovernanceSlot } from "@/lib/reports";
import { fetchSlots, fetchViewRoots, resolveUnit, sectLabel } from "@/lib/reports-server";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../unit-filter";

export const metadata: Metadata = { title: "ผังสายการปกครอง" };
export const dynamic = "force-dynamic";

type UnitNode = {
  id: string;
  name: string;
  level: OrgLevel;
  slots: GovernanceSlot[];
  missing: number;
  children: UnitNode[];
};

function buildTree(slots: GovernanceSlot[]): UnitNode[] {
  const nodes = new Map<string, UnitNode & { parent_id: string | null }>();
  for (const s of slots) {
    let node = nodes.get(s.unit_id);
    if (!node) {
      node = {
        id: s.unit_id,
        parent_id: s.parent_id,
        name: s.unit_name,
        level: s.unit_level as OrgLevel,
        slots: [],
        missing: 0,
        children: [],
      };
      nodes.set(s.unit_id, node);
    }
    node.slots.push(s);
    node.missing += s.missing;
  }
  const roots: UnitNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const vacantClass = "rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900";

function SlotLine({ slot }: { slot: GovernanceSlot }) {
  const holders = slot.holders ? slot.holders.split("\n") : [];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-kind={slot.kind}>
      <dt className="w-44 shrink-0 text-sm text-muted-foreground">{slot.position_name}</dt>
      <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {holders.map((h) => (
          <span key={h} className="font-semibold">
            {h}
          </span>
        ))}
        {slot.missing > 0 ? (
          <span className={vacantClass} data-vacant>
            {holders.length === 0 ? "ว่าง" : `ว่างอีก ${slot.missing} ตำแหน่ง`}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function UnitBlock({ node, depth }: { node: UnitNode; depth: number }) {
  const total = (n: UnitNode): number => n.missing + n.children.reduce((s, c) => s + total(c), 0);
  const below = node.children.reduce((s, c) => s + total(c), 0);
  return (
    <div
      className={cn("rounded-xl border bg-card p-4", node.missing > 0 && "border-amber-400")}
      data-testid="chart-unit"
      data-unit={node.name}
    >
      <p className="font-bold text-primary">
        {node.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{LEVEL_LABEL[node.level]}</span>
      </p>
      <dl className="mt-2 flex flex-col gap-1.5">
        {node.slots.map((s) => (
          <SlotLine key={s.position_key} slot={s} />
        ))}
      </dl>
      {node.children.length > 0 ? (
        <details className="mt-3" open={depth < 1}>
          <summary className="cursor-pointer rounded-md px-1 py-1 font-semibold text-primary hover:bg-secondary">
            หน่วยใต้สังกัด {node.children.length} หน่วย
            {below > 0 ? <span className={cn(vacantClass, "ml-2")}>มีตำแหน่งว่าง {below} ตำแหน่ง</span> : null}
          </summary>
          <div className="mt-3 flex flex-col gap-3 border-l-2 border-input pl-3 sm:pl-5">
            {node.children.map((c) => (
              <UnitBlock key={c.id} node={c} depth={depth + 1} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default async function ChartPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  await requireMenu("/app/personnel");
  const { unit: rawUnit } = await searchParams;
  const [roots, units] = await Promise.all([fetchViewRoots(), fetchAccessibleUnits()]);
  const unit = await resolveUnit(rawUnit, roots);
  const slots = unit ? await fetchSlots(unit.id) : [];
  const tree = buildTree(slots);
  const vacant = slots.reduce((s, x) => s + x.missing, 0);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← กลับไปทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ผังสายการปกครอง</h1>
      <p className="mt-1 text-muted-foreground">
        เลือกภาคหรือเขต แล้วดูชื่อเจ้าคณะ รองเจ้าคณะ และเลขานุการ ของแต่ละหน่วยตามลำดับชั้น ตำแหน่งที่ว่างแสดงด้วยป้ายสีเหลือง
      </p>

      {roots.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          บทบาทของท่านยังไม่มีสิทธิ์ดูทะเบียนบุคคล จึงไม่มีผังให้แสดง
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {roots.length > 1 ? (
            <nav aria-label="เลือกภาค" className="flex flex-wrap gap-2" data-testid="chart-roots">
              {roots.map((r) => (
                <Link
                  key={r.id}
                  href={`/app/personnel/chart?unit=${r.id}`}
                  aria-current={unit?.id === r.id ? "page" : undefined}
                  className={cn(
                    "rounded-md border px-3 py-2 font-medium",
                    unit?.id === r.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {r.name}
                  {r.level === "region" && sectLabel(r.sect) && !r.name.includes(sectLabel(r.sect)) ? ` (${sectLabel(r.sect)})` : ""}
                </Link>
              ))}
            </nav>
          ) : null}
          <UnitFilter
            units={units}
            value={unit?.id ?? ""}
            param="unit"
            currentName={unit?.name}
            applyLabel="แสดงผังของเขตนี้"
            allowClear={false}
          />
          <p data-testid="chart-summary">
            แสดง {tree.length ? new Set(slots.map((s) => s.unit_id)).size : 0} หน่วย ·{" "}
            {vacant > 0 ? (
              <span className={vacantClass}>ตำแหน่งว่างรวม {vacant} ตำแหน่ง</span>
            ) : (
              <span>ไม่มีตำแหน่งว่าง</span>
            )}{" "}
            ·{" "}
            <Link
              href={`/app/personnel/reports?report=vacancies${unit ? `&unit=${unit.id}` : ""}`}
              className="text-primary underline underline-offset-4"
            >
              ดูรายงานตำแหน่งว่าง
            </Link>
          </p>
          {tree.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground">
              ไม่มีหน่วยในเขตนี้ที่ท่านมีสิทธิ์ดู หรือเขตนี้ไม่มีตำแหน่งปกครอง
            </p>
          ) : (
            <div className="flex flex-col gap-3" data-testid="chart-tree">
              {tree.map((node) => (
                <UnitBlock key={node.id} node={node} depth={0} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
