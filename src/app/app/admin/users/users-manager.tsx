"use client";

import { useState, useTransition } from "react";
import { Check, FileText, Plus, Power, PowerOff, X } from "lucide-react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_LABEL } from "@/lib/auth/config";
import type { ActionResult } from "@/lib/errors";
import type { OrgUnit } from "@/lib/org-units";
import { cn } from "@/lib/utils";

import { approveRequest, endRole, getLetterUrl, grantRole, rejectRequest, setAccountStatus } from "./actions";

type Person = {
  id: string;
  title_prefix: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  email: string;
  phone: string;
};

export type RoleOption = { key: string; name: string; requires_org_unit: boolean };

export type RequestRow = {
  id: string;
  kind: "new" | "reactivate";
  position_text: string;
  requested_role_key: string | null;
  org_unit_id: string | null;
  letter_path: string | null;
  note: string;
  created_at: string;
  profiles: Person | null;
  org_units: { name: string } | null;
  roles: { name: string } | null;
};

export type AccountRow = Person & {
  status: "active" | "suspended";
  status_reason: string | null;
  last_seen_at: string | null;
  user_roles: {
    id: string;
    role_key: string;
    org_unit_id: string | null;
    starts_on: string;
    ends_on: string | null;
    roles: { name: string } | null;
    org_units: { name: string } | null;
  }[];
};

type DialogState =
  | { kind: "approve"; request: RequestRow }
  | { kind: "reject"; request: RequestRow }
  | { kind: "status"; account: AccountRow }
  | { kind: "grant"; account: AccountRow }
  | null;

const nameOf = (p: Person | null) =>
  p ? [p.title_prefix, p.first_name, p.monastic_name, p.last_name].filter(Boolean).join(" ") : "(ไม่พบข้อมูล)";

const thaiDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "ยังไม่เคยเข้าใช้";

const today = () => new Date().toISOString().slice(0, 10);

export function UsersManager({
  isAdmin,
  currentUserId,
  requests,
  accounts,
  roles,
  units,
}: {
  isAdmin: boolean;
  currentUserId: string;
  requests: RequestRow[];
  accounts: AccountRow[];
  roles: RoleOption[];
  units: OrgUnit[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const done = (message?: string) => {
    setDialog(null);
    setError(null);
    setFlash(message ?? null);
  };

  const openLetter = (requestId: string) =>
    startTransition(async () => {
      const result = await getLetterUrl(requestId);
      if (result.ok) window.open(result.url, "_blank", "noopener");
      else setError(result.error);
    });

  const removeRole = (userRoleId: string) =>
    startTransition(async () => {
      const result = await endRole(userRoleId);
      if (result.ok) done(result.message);
      else setError(result.error);
    });

  const q = query.trim().toLowerCase();
  const shownAccounts = accounts.filter(
    (a) => !q || nameOf(a).toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
  );

  return (
    <div className="mt-6 flex flex-col gap-8">
      {flash ? <InfoText>{flash}</InfoText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {/* คำขอรอพิจารณา */}
      <div>
        <h2 className="text-xl font-bold text-primary">คำขอรอพิจารณา ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่มีคำขอรอพิจารณา</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3" data-testid="pending-requests">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">
                      {nameOf(r.profiles)}
                      <span className="ml-2 rounded bg-accent px-2 py-0.5 text-sm font-semibold">
                        {r.kind === "new" ? "ขอบัญชีใหม่" : "ขอเปิดใช้บัญชี"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {r.profiles?.email} · {r.profiles?.phone || "ไม่ระบุเบอร์"}
                    </p>
                    {r.kind === "new" ? (
                      <p>
                        ตำแหน่ง: {r.position_text} · บทบาทที่ขอ: {r.roles?.name ?? "-"}
                        {r.org_units ? ` · สังกัด: ${r.org_units.name}` : ""}
                      </p>
                    ) : (
                      <p>เหตุผล: {r.note || "-"}</p>
                    )}
                    <p className="text-sm text-muted-foreground">ยื่นเมื่อ {thaiDate(r.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.letter_path ? (
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => openLetter(r.id)}>
                        <FileText aria-hidden />
                        ดูหนังสือรับรอง
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => setDialog({ kind: "approve", request: r })}>
                      <Check aria-hidden />
                      อนุมัติ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "reject", request: r })}>
                      <X aria-hidden />
                      ไม่อนุมัติ
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* บัญชีทั้งหมดที่ดูแล */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold text-primary">บัญชีผู้ใช้ ({accounts.length})</h2>
          <Input
            type="search"
            aria-label="ค้นหาชื่อหรืออีเมล"
            placeholder="ค้นหาชื่อหรืออีเมล"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
        </div>
        {shownAccounts.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ไม่พบบัญชี</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="accounts">
            {shownAccounts.map((a) => {
              const activeRoles = a.user_roles.filter((ur) => !ur.ends_on || ur.ends_on >= today());
              const isSelf = a.id === currentUserId;
              return (
                <li key={a.id} className={cn("rounded-xl border bg-card p-4", a.status === "suspended" && "bg-muted")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {nameOf(a)}
                        {isSelf ? <span className="ml-2 text-sm text-muted-foreground">(ท่าน)</span> : null}
                        <span
                          className={cn(
                            "ml-2 rounded border px-2 py-0.5 text-sm font-semibold",
                            a.status === "suspended" ? "border-destructive text-destructive" : "border-input",
                          )}
                        >
                          {STATUS_LABEL[a.status]}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {a.email} · {a.phone || "ไม่ระบุเบอร์"} · เข้าใช้ล่าสุด {thaiDate(a.last_seen_at)}
                      </p>
                      {a.status === "suspended" && a.status_reason ? (
                        <p className="text-destructive">เหตุผล: {a.status_reason}</p>
                      ) : null}
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {activeRoles.length === 0 ? (
                          <li className="text-muted-foreground">ไม่มีบทบาท</li>
                        ) : (
                          activeRoles.map((ur) => (
                            <li key={ur.id} className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-sm font-medium">
                              {ur.roles?.name}
                              {ur.org_units ? ` · ${ur.org_units.name}` : ""}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => removeRole(ur.id)}
                                  className="ml-1 rounded p-0.5 hover:bg-background"
                                  aria-label={`สิ้นสุดบทบาท ${ur.roles?.name} ของ ${nameOf(a)}`}
                                >
                                  <X className="size-4" aria-hidden />
                                </button>
                              ) : null}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    {!isSelf ? (
                      <div className="flex flex-wrap gap-2">
                        {isAdmin ? (
                          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "grant", account: a })}>
                            <Plus aria-hidden />
                            เพิ่มบทบาท
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDialog({ kind: "status", account: a })}
                          aria-label={`${a.status === "active" ? "ระงับ" : "เปิดใช้"}บัญชี ${nameOf(a)}`}
                        >
                          {a.status === "active" ? <PowerOff aria-hidden /> : <Power aria-hidden />}
                          {a.status === "active" ? "ระงับ" : "เปิดใช้"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {dialog?.kind === "approve" ? (
        <ApproveDialog request={dialog.request} roles={roles} units={units} isAdmin={isAdmin} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.kind === "reject" ? (
        <ReasonDialog
          title="ไม่อนุมัติคำขอ"
          description={nameOf(dialog.request.profiles)}
          label="เหตุผลที่ไม่อนุมัติ"
          confirmText="ยืนยันไม่อนุมัติ"
          requireReason
          onClose={() => setDialog(null)}
          onDone={done}
          run={(note) => rejectRequest({ requestId: dialog.request.id, note })}
        />
      ) : null}
      {dialog?.kind === "status" ? (
        <ReasonDialog
          title={dialog.account.status === "active" ? "ระงับบัญชี" : "เปิดใช้บัญชี"}
          description={`${nameOf(dialog.account)} (${dialog.account.email})`}
          label={dialog.account.status === "active" ? "เหตุผลที่ระงับ" : "หมายเหตุ (ไม่บังคับ)"}
          confirmText={dialog.account.status === "active" ? "ยืนยันระงับบัญชี" : "ยืนยันเปิดใช้บัญชี"}
          requireReason={dialog.account.status === "active"}
          onClose={() => setDialog(null)}
          onDone={done}
          run={(reason) =>
            setAccountStatus({
              userId: dialog.account.id,
              status: dialog.account.status === "active" ? "suspended" : "active",
              reason,
            })
          }
        />
      ) : null}
      {dialog?.kind === "grant" ? (
        <GrantDialog account={dialog.account} roles={roles} units={units} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
    </div>
  );
}

function RoleAndUnit({
  roles,
  units,
  roleKey,
  setRoleKey,
  defaultUnit,
}: {
  roles: RoleOption[];
  units: OrgUnit[];
  roleKey: string;
  setRoleKey: (v: string) => void;
  defaultUnit?: string | null;
}) {
  const role = roles.find((r) => r.key === roleKey);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dialog-role">บทบาท</Label>
        <select id="dialog-role" className={selectClass} value={roleKey} onChange={(e) => setRoleKey(e.target.value)} required>
          <option value="">-- เลือกบทบาท --</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {role?.requires_org_unit ? <OrgUnitPicker units={units} name="org_unit_id" defaultValue={defaultUnit} required /> : null}
    </>
  );
}

function ApproveDialog({
  request,
  roles,
  units,
  isAdmin,
  onClose,
  onDone,
}: {
  request: RequestRow;
  roles: RoleOption[];
  units: OrgUnit[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [roleKey, setRoleKey] = useState(request.requested_role_key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // ผู้อนุมัติที่ไม่ใช่ผู้ดูแลระบบ กำหนดได้เฉพาะบทบาทที่ผูกกับเขตปกครอง
  const options = isAdmin ? roles : roles.filter((r) => r.requires_org_unit);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result: ActionResult = await approveRequest({
        requestId: request.id,
        roleKey: request.kind === "new" ? roleKey : null,
        orgUnitId: String(fd.get("org_unit_id") ?? "") || null,
        note: String(fd.get("note") ?? ""),
      });
      if (result.ok) onDone(`${result.message}: ${nameOf(request.profiles)}`);
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{request.kind === "new" ? "อนุมัติบัญชีผู้ใช้" : "อนุมัติเปิดใช้บัญชี"}</DialogTitle>
          <DialogDescription>
            {nameOf(request.profiles)}
            {request.position_text ? ` · ${request.position_text}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {request.kind === "new" ? (
            <>
              <p className="text-muted-foreground">ตรวจหนังสือรับรองก่อน แล้วยืนยันบทบาทและเขตปกครองที่จะให้สิทธิ์</p>
              <RoleAndUnit roles={options} units={units} roleKey={roleKey} setRoleKey={setRoleKey} defaultUnit={request.org_unit_id} />
            </>
          ) : (
            <p>บัญชีจะกลับมาใช้งานได้ด้วยบทบาทเดิม</p>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="approve-note">หมายเหตุ (ไม่บังคับ)</Label>
            <Input id="approve-note" name="note" />
          </div>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : "ยืนยันอนุมัติ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({
  account,
  roles,
  units,
  onClose,
  onDone,
}: {
  account: AccountRow;
  roles: RoleOption[];
  units: OrgUnit[];
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [roleKey, setRoleKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await grantRole({
        userId: account.id,
        roleKey,
        orgUnitId: String(fd.get("org_unit_id") ?? "") || null,
      });
      if (result.ok) onDone(`${result.message}: ${nameOf(account)}`);
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>เพิ่มบทบาท</DialogTitle>
          <DialogDescription>{nameOf(account)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <RoleAndUnit roles={roles} units={units} roleKey={roleKey} setRoleKey={setRoleKey} />
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : "เพิ่มบทบาท"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  title,
  description,
  label,
  confirmText,
  requireReason,
  run,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  label: string;
  confirmText: string;
  requireReason: boolean;
  run: (reason: string) => Promise<ActionResult>;
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await run(reason);
      if (result.ok) onDone(`${result.message}: ${description}`);
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="reason">{label}</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required={requireReason} autoFocus />
          </div>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
