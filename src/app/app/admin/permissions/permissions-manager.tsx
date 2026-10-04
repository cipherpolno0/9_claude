"use client";

import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { PERSONNEL_SCOPES, PERSONNEL_SCOPE_LABEL, scopeRank, type PersonnelScope } from "@/lib/auth/config";

import { setRoleMenu, setRoleScope, type ScopeArea } from "./actions";

export type RoleRow = {
  key: string;
  name: string;
  requires_org_unit: boolean;
  personnel_view: PersonnelScope;
  personnel_edit: PersonnelScope;
  places_view: PersonnelScope;
  places_edit: PersonnelScope;
};

/** ระบบที่ตั้งขอบเขตดู/แก้ไขได้ (เพิ่มระบบใหม่ที่นี่ คู่กับคอลัมน์ <area>_view / <area>_edit ใน roles) */
const AREAS: { key: ScopeArea; title: string; menu: string; menuTitle: string }[] = [
  { key: "personnel", title: "ทะเบียนบุคคล", menu: "/app/personnel", menuTitle: "บุคลากร" },
  { key: "places", title: "ทะเบียนสถานที่", menu: "/app/places", menuTitle: "ทะเบียนสถานที่" },
];
export type MenuRow = { role_key: string; menu_href: string; enabled: boolean };

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-60";

export function PermissionsManager({
  roles,
  menus,
  menuItems,
}: {
  roles: RoleRow[];
  menus: MenuRow[];
  menuItems: { href: string; title: string }[];
}) {
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(menus.map((m) => [`${m.role_key}|${m.menu_href}`, m.enabled])),
  );
  const [scopes, setScopes] = useState(() =>
    Object.fromEntries(
      roles.flatMap((r) =>
        AREAS.map((a) => [`${r.key}|${a.key}`, { view: r[`${a.key}_view`], edit: r[`${a.key}_edit`] }] as const),
      ),
    ),
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleMenu = (role: RoleRow, href: string, value: boolean) => {
    const id = `${role.key}|${href}`;
    setEnabled((s) => ({ ...s, [id]: value }));
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await setRoleMenu(role.key, href, value);
      if (result.ok) setFlash(`บันทึกแล้ว: ${role.name}`);
      else {
        setEnabled((s) => ({ ...s, [id]: !value }));
        setError(result.error);
      }
    });
  };

  const changeScope = (role: RoleRow, area: ScopeArea, field: "view" | "edit", value: PersonnelScope) => {
    const id = `${role.key}|${area}`;
    const before = scopes[id];
    const next = { ...before, [field]: value };
    // สิทธิ์แก้ไขกว้างกว่าสิทธิ์ดูไม่ได้: ลดสิทธิ์ดู = ลดสิทธิ์แก้ไขตาม, เพิ่มสิทธิ์แก้ไข = เพิ่มสิทธิ์ดูตาม
    if (scopeRank(next.edit) > scopeRank(next.view)) {
      if (field === "view") next.edit = next.view;
      else next.view = next.edit;
    }
    setScopes((s) => ({ ...s, [id]: next }));
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await setRoleScope(role.key, area, next.view, next.edit);
      if (result.ok) setFlash(`บันทึกแล้ว: ${role.name}`);
      else {
        setScopes((s) => ({ ...s, [id]: before }));
        setError(result.error);
      }
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="rounded-xl border bg-secondary/50 p-4 text-sm leading-relaxed">
        <p className="font-semibold">หลักที่ระบบบังคับเสมอ</p>
        <ul className="mt-1 list-disc pl-5">
          <li>ผู้ดูแลระบบเห็นทุกเมนู และดู แก้ไขทะเบียนบุคคลได้ทุกเขต (แก้ไม่ได้)</li>
          <li>ทุกคนเห็นแดชบอร์ด และเห็นประวัติของตนเองเสมอ</li>
          <li>สิทธิ์แก้ไขกว้างกว่าสิทธิ์ดูไม่ได้ และไม่มีบทบาทใดเห็นข้ามสายการปกครอง ยกเว้นเลือก “ทุกเขต”</li>
          <li>ขอบเขตทะเบียนบุคคลใช้กับ ข้อมูลบุคคล ตำแหน่งปกครอง ทะเบียน จศป. และคำขอเปลี่ยนสถานะ</li>
          <li>ขอบเขตทะเบียนสถานที่ใช้กับ วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา และองค์กร ตามเขตปกครองคณะสงฆ์ที่สังกัด</li>
        </ul>
      </div>

      <div aria-live="polite" className="min-h-6">
        {flash ? <InfoText>{flash}</InfoText> : null}
        <ErrorText>{error}</ErrorText>
      </div>

      {roles.map((role) => {
        const locked = role.key === "admin";
        // บทบาทที่ไม่ผูกกับเขตปกครองไม่มี "หน่วยตน" จึงเลือกได้เพียง ไม่ได้ หรือ ทุกเขต
        const optionsOf = (scope: { view: PersonnelScope; edit: PersonnelScope }) =>
          PERSONNEL_SCOPES.filter(
            (s) => role.requires_org_unit || s === "none" || s === "all" || s === scope.view || s === scope.edit,
          );
        return (
          <fieldset key={role.key} className="rounded-xl border bg-card p-5" data-role={role.key}>
            <legend className="px-1 text-xl font-bold text-primary">{role.name}</legend>
            <p className="text-sm text-muted-foreground">
              {role.requires_org_unit ? "ผูกกับเขตปกครอง" : "ไม่ผูกกับเขตปกครอง"}
              {locked ? " · สิทธิ์เต็มเสมอ แก้ไขไม่ได้" : ""}
            </p>

            <p className="mt-4 font-semibold">เมนูที่ใช้ได้</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {menuItems.map((m) => (
                <label key={m.href} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-[var(--primary)]"
                    checked={locked || (enabled[`${role.key}|${m.href}`] ?? false)}
                    disabled={pending || locked}
                    onChange={(e) => toggleMenu(role, m.href, e.target.checked)}
                    aria-label={`${role.name}: ${m.title}`}
                  />
                  {m.title}
                </label>
              ))}
            </div>

            {AREAS.map((area) => {
              const scope = scopes[`${role.key}|${area.key}`];
              const options = optionsOf(scope);
              return (
                <div key={area.key} data-area={area.key}>
                  <p className="mt-5 font-semibold">{area.title}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span>ดูได้</span>
                      <select
                        className={selectClass}
                        value={scope.view}
                        disabled={pending || locked}
                        onChange={(e) => changeScope(role, area.key, "view", e.target.value as PersonnelScope)}
                        aria-label={`${role.name}: ดู${area.title}`}
                      >
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {PERSONNEL_SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>เพิ่มและแก้ไขได้</span>
                      <select
                        className={selectClass}
                        value={scope.edit}
                        disabled={pending || locked}
                        onChange={(e) => changeScope(role, area.key, "edit", e.target.value as PersonnelScope)}
                        aria-label={`${role.name}: แก้ไข${area.title}`}
                      >
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {PERSONNEL_SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {scope.view !== "none" && !locked && !(enabled[`${role.key}|${area.menu}`] ?? false) ? (
                    <p className="mt-2 text-sm text-destructive">
                      บทบาทนี้มีสิทธิ์ดู{area.title} แต่ยังไม่ได้เปิดเมนู {area.menuTitle} จึงเข้าหน้าทะเบียนไม่ได้
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
