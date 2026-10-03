"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LEVEL_LABEL,
  SECTS,
  SECT_LABEL,
  childLevelOf,
  type OrgUnitNode,
  type Sect,
} from "@/lib/org-units";
import { cn } from "@/lib/utils";

import {
  createOrgUnit,
  setOrgUnitActive,
  updateOrgUnit,
  type ActionResult,
} from "./actions";
import { ImportDialog } from "./import-dialog";

type SectFilter = "all" | Sect;

type DialogState =
  | { kind: "add"; parent: OrgUnitNode | null }
  | { kind: "edit"; unit: OrgUnitNode }
  | { kind: "toggle"; unit: OrgUnitNode }
  | { kind: "import" }
  | null;

/** กรองต้นไม้: เก็บหน่วยที่ตรงเงื่อนไข และหน่วยเหนือของหน่วยนั้น */
function filterTree(
  nodes: OrgUnitNode[],
  keep: (n: OrgUnitNode) => boolean,
  visible: (n: OrgUnitNode) => boolean,
): OrgUnitNode[] {
  const out: OrgUnitNode[] = [];
  for (const node of nodes) {
    if (!visible(node)) continue;
    const children = filterTree(node.children, keep, visible);
    if (keep(node) || children.length > 0) out.push({ ...node, children });
  }
  return out;
}

function collectIds(nodes: OrgUnitNode[], maxDepth: number, depth = 0, acc = new Set<string>()) {
  for (const n of nodes) {
    if (depth < maxDepth && n.children.length > 0) {
      acc.add(n.id);
      collectIds(n.children, maxDepth, depth + 1, acc);
    }
  }
  return acc;
}

export function OrgUnitManager({ tree, total }: { tree: OrgUnitNode[]; total: number }) {
  const [sectFilter, setSectFilter] = useState<SectFilter>("all");
  const [showInactive, setShowInactive] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => collectIds(tree, 2));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      filterTree(
        tree,
        (n) => !q || n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q),
        (n) =>
          (showInactive || n.is_active) &&
          (sectFilter === "all" || n.sect === null || n.sect === sectFilter),
      ),
    [tree, q, showInactive, sectFilter],
  );
  // ขณะค้นหา ให้กางทุกชั้นเพื่อให้เห็นผลลัพธ์
  const isOpen = (id: string) => (q ? true : expanded.has(id));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const done = (message?: string, openId?: string) => {
    setDialog(null);
    setFlash(message ?? null);
    if (openId) setExpanded((prev) => new Set(prev).add(openId));
  };

  return (
    <div className="mt-6">
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ kind: "import" })}>
          <Upload aria-hidden />
          นำเข้าจาก Excel
        </Button>
        <Button asChild variant="outline">
          <a href="/app/admin/org-units/template">
            <Download aria-hidden />
            ดาวน์โหลดแม่แบบ
          </a>
        </Button>
        {tree.length === 0 ? (
          <Button variant="gold" onClick={() => setDialog({ kind: "add", parent: null })}>
            <Plus aria-hidden />
            เพิ่มส่วนกลาง
          </Button>
        ) : null}
        <p className="ml-auto text-muted-foreground">
          ทั้งหมด {total.toLocaleString("th-TH")} หน่วย
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="กรองตามนิกาย" className="flex rounded-md border border-input p-1">
          {(["all", ...SECTS] as SectFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sectFilter === s}
              onClick={() => setSectFilter(s)}
              className={cn(
                "rounded px-3 py-1.5 font-medium",
                sectFilter === s ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {s === "all" ? "ทุกนิกาย" : SECT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="ค้นหาชื่อหรือรหัสหน่วย"
            placeholder="ค้นหาชื่อหรือรหัสหน่วย"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          แสดงหน่วยที่ปิดใช้งาน
        </label>
      </div>

      {flash ? (
        <p role="status" className="mt-4 rounded-md border border-input bg-secondary px-4 py-2 font-medium text-primary">
          {flash}
        </p>
      ) : null}

      {/* ต้นไม้ */}
      <div className="mt-4 rounded-xl border bg-card">
        {tree.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">
            ยังไม่มีเขตปกครองในระบบ เริ่มจากกด “เพิ่มส่วนกลาง” หรือ “นำเข้าจาก Excel”
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">ไม่พบหน่วยที่ตรงกับเงื่อนไข</p>
        ) : (
          <ul role="tree" aria-label="ต้นไม้เขตปกครอง" className="p-2">
            {shown.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                isOpen={isOpen}
                onToggle={toggle}
                onAction={setDialog}
              />
            ))}
          </ul>
        )}
      </div>

      {dialog?.kind === "add" ? (
        <UnitFormDialog mode="add" parent={dialog.parent} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "edit" ? (
        <UnitFormDialog mode="edit" unit={dialog.unit} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "toggle" ? (
        <ToggleDialog unit={dialog.unit} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "import" ? (
        <ImportDialog onClose={() => setDialog(null)} onDone={done} />
      ) : null}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  isOpen,
  onToggle,
  onAction,
}: {
  node: OrgUnitNode;
  depth: number;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  onAction: (d: DialogState) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = hasChildren && isOpen(node.id);
  const childLevel = childLevelOf(node.level);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={false}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md py-1.5 pr-1 hover:bg-muted",
          !node.is_active && "opacity-60",
        )}
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          >
            {open ? <ChevronDown className="size-5" aria-hidden /> : <ChevronRight className="size-5" aria-hidden />}
            <span className="sr-only">{open ? "หุบ" : "กาง"} {node.name}</span>
          </button>
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}

        <span className="shrink-0 rounded bg-accent px-2 py-0.5 text-sm font-semibold text-accent-foreground">
          {LEVEL_LABEL[node.level]}
        </span>
        <span className="min-w-0 font-medium break-words">{node.name}</span>
        <span className="text-sm text-muted-foreground">{node.code}</span>
        {node.sect ? (
          <span className="text-sm text-muted-foreground">· {SECT_LABEL[node.sect]}</span>
        ) : null}
        {hasChildren ? (
          <span className="text-sm text-muted-foreground">· {node.children.length} หน่วย</span>
        ) : null}
        {!node.is_active ? (
          <span className="rounded border border-destructive px-2 py-0.5 text-sm font-semibold text-destructive">
            ปิดใช้งาน
          </span>
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {childLevel && node.is_active ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction({ kind: "add", parent: node })}
              aria-label={`เพิ่ม${LEVEL_LABEL[childLevel]}ใต้ ${node.name}`}
            >
              <Plus aria-hidden />
              <span className="hidden sm:inline">เพิ่ม{LEVEL_LABEL[childLevel]}</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction({ kind: "edit", unit: node })}
            aria-label={`แก้ไข ${node.name}`}
          >
            <Pencil aria-hidden />
            <span className="hidden sm:inline">แก้ไข</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction({ kind: "toggle", unit: node })}
            aria-label={`${node.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"} ${node.name}`}
          >
            {node.is_active ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            <span className="hidden sm:inline">{node.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</span>
          </Button>
        </span>
      </div>

      {open ? (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isOpen={isOpen}
              onToggle={onToggle}
              onAction={onAction}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 font-medium text-destructive">
      {children}
    </p>
  );
}

function UnitFormDialog(
  props: (
    | { mode: "add"; parent: OrgUnitNode | null }
    | { mode: "edit"; unit: OrgUnitNode }
  ) & { onClose: () => void; onDone: (message?: string, openId?: string) => void },
) {
  const editing = props.mode === "edit" ? props.unit : null;
  const parent = props.mode === "add" ? props.parent : null;
  const level = editing ? editing.level : parent ? childLevelOf(parent.level)! : "central";
  const needSect = props.mode === "add" && parent !== null && parent.sect === null;

  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [sect, setSect] = useState<Sect | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needSect && !sect) {
      setError("กรุณาเลือกนิกาย");
      return;
    }
    startTransition(async () => {
      const result: ActionResult = editing
        ? await updateOrgUnit({ id: editing.id, name, code })
        : await createOrgUnit({ parentId: parent?.id ?? null, sect: sect || null, name, code });
      if (result.ok) props.onDone(result.message, parent?.id);
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `แก้ไข${LEVEL_LABEL[level]}` : `เพิ่ม${LEVEL_LABEL[level]}`}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "แก้ไขได้เฉพาะชื่อและรหัส ระดับและหน่วยเหนือเปลี่ยนไม่ได้"
              : parent
                ? `อยู่ใต้ ${parent.name}${parent.sect ? ` (${SECT_LABEL[parent.sect]})` : ""}`
                : "หน่วยบนสุดของต้นไม้เขตปกครอง"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {needSect ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="unit-sect">นิกาย</Label>
              <select
                id="unit-sect"
                value={sect}
                onChange={(e) => setSect(e.target.value as Sect | "")}
                className="h-11 rounded-md border border-input bg-background px-3 text-base"
                required
              >
                <option value="">-- เลือกนิกาย --</option>
                {SECTS.map((s) => (
                  <option key={s} value={s}>
                    {SECT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="unit-name">ชื่อหน่วย</Label>
            <Input id="unit-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="unit-code">รหัสหน่วย</Label>
            <Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <p className="text-sm text-muted-foreground">ห้ามซ้ำกับหน่วยอื่นในระบบ</p>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleDialog({
  unit,
  onClose,
  onDone,
}: {
  unit: OrgUnitNode;
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const turningOff = unit.is_active;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await setOrgUnitActive(unit.id, !unit.is_active);
      if (result.ok) onDone(`${result.message}: ${unit.name}`);
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{turningOff ? "ปิดใช้งานหน่วยนี้" : "เปิดใช้งานหน่วยนี้"}</DialogTitle>
          <DialogDescription>
            {unit.name} ({unit.code})
          </DialogDescription>
        </DialogHeader>
        <p>
          {turningOff
            ? "ข้อมูลจะไม่ถูกลบ และเปิดใช้งานกลับได้ภายหลัง หน่วยที่ยังมีหน่วยใต้สังกัดเปิดใช้งานอยู่จะปิดไม่ได้"
            : "หน่วยนี้จะกลับมาใช้งานได้ตามปกติ"}
        </p>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? "กำลังบันทึก..." : turningOff ? "ยืนยันปิดใช้งาน" : "ยืนยันเปิดใช้งาน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
