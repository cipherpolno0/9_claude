import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { ACCOUNT_MANAGER_ROLES, EXAM_ROUND_MANAGER_ROLES, QUIZ_MANAGER_ROLES, type PersonnelScope } from "./config";

export type Profile = {
  id: string;
  title_prefix: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: "pending" | "active" | "suspended" | "rejected";
  status_reason: string | null;
  password_changed_at: string;
  last_seen_at: string | null;
};

export type MyRole = {
  user_role_id: string;
  role_key: string;
  org_unit_id: string | null;
  mfa_required: boolean;
  effective: boolean;
};

export function fullName(p: Pick<Profile, "title_prefix" | "first_name" | "monastic_name" | "last_name">) {
  return [p.title_prefix, p.first_name, p.monastic_name, p.last_name].filter(Boolean).join(" ").trim();
}

const DAY = 24 * 60 * 60 * 1000;

/** ข้อมูลผู้ใช้ที่ล็อกอินอยู่ (อ่านครั้งเดียวต่อหนึ่งคำขอ) คืน null ถ้ายังไม่ล็อกอิน */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, rolesRes, aalRes, settingsRes, factorsRes, menusRes, scopesRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_role_rows"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("app_settings").select("key, value_int"),
    supabase.auth.mfa.listFactors(),
    supabase.from("role_menus").select("role_key, menu_href").eq("enabled", true),
    supabase.from("roles").select("key, personnel_view, personnel_edit, places_view, places_edit, venues_view, venues_edit"),
  ]);

  const profile = (profileRes.data as Profile | null) ?? null;
  const roles = (rolesRes.data as MyRole[] | null) ?? [];
  const settings = Object.fromEntries(
    ((settingsRes.data as { key: string; value_int: number }[] | null) ?? []).map((s) => [s.key, s.value_int]),
  );
  const aal = aalRes.data?.currentLevel ?? "aal1";
  const hasVerifiedFactor = (factorsRes.data?.totp ?? []).some((f) => f.status === "verified");
  const mfaRequired = roles.some((r) => r.mfa_required);

  const maxAge = settings.password_max_age_days ?? 180;
  const warnDays = settings.password_warn_days ?? 14;
  const changedAt = profile ? new Date(profile.password_changed_at).getTime() : Date.now();
  const passwordDaysLeft = Math.ceil((changedAt + maxAge * DAY - Date.now()) / DAY);

  const roleKeys = roles.map((r) => r.role_key);
  const effectiveKeys = roles.filter((r) => r.effective).map((r) => r.role_key);

  // เมนูและขอบเขตทะเบียนบุคคลอ่านจากค่าตั้งของผู้ดูแลระบบ (หน้า สิทธิ์ตามบทบาท)
  const allowedMenus = new Set<string>(["/app"]);
  for (const row of (menusRes.data as { role_key: string; menu_href: string }[] | null) ?? []) {
    if (roleKeys.includes(row.role_key)) allowedMenus.add(row.menu_href);
  }
  const allMenus = roleKeys.includes("admin");

  type ScopeRow = {
    key: string;
    personnel_view: PersonnelScope;
    personnel_edit: PersonnelScope;
    places_view: PersonnelScope;
    places_edit: PersonnelScope;
    venues_view: PersonnelScope;
    venues_edit: PersonnelScope;
  };
  const scopes = new Map(((scopesRes.data as ScopeRow[] | null) ?? []).map((r) => [r.key, r]));
  // มีสิทธิ์แก้ไขทะเบียนบุคคลอย่างน้อยหนึ่งเขต (สิทธิ์จริงตรวจที่ฐานข้อมูลตามเขตปกครองอีกชั้น)
  const canEditPersonnel = roles.some((r) => {
    const edit = scopes.get(r.role_key)?.personnel_edit ?? "none";
    return r.effective && (edit === "all" || (edit !== "none" && r.org_unit_id !== null));
  });
  const canEditPlaces = roles.some((r) => {
    const edit = scopes.get(r.role_key)?.places_edit ?? "none";
    return r.effective && (edit === "all" || (edit !== "none" && r.org_unit_id !== null));
  });
  const canEditVenues = roles.some((r) => {
    const edit = scopes.get(r.role_key)?.venues_edit ?? "none";
    return r.effective && (edit === "all" || (edit !== "none" && r.org_unit_id !== null));
  });
  const canViewVenues = roles.some((r) => {
    const view = scopes.get(r.role_key)?.venues_view ?? "none";
    return r.effective && (view === "all" || (view !== "none" && r.org_unit_id !== null));
  });
  const canViewAllPersonnel = roles.some((r) => r.effective && scopes.get(r.role_key)?.personnel_view === "all");

  return {
    user,
    profile,
    roles,
    roleKeys,
    isAdmin: effectiveKeys.includes("admin"),
    isAccountManager: effectiveKeys.some((k) => ACCOUNT_MANAGER_ROLES.includes(k)),
    aal,
    hasVerifiedFactor,
    mfaRequired,
    mfaSatisfied: !mfaRequired || aal === "aal2",
    passwordDaysLeft,
    passwordExpired: passwordDaysLeft <= 0,
    passwordWarn: passwordDaysLeft > 0 && passwordDaysLeft <= warnDays,
    allMenus,
    allowedMenus: [...allowedMenus],
    canEditPersonnel,
    canViewAllPersonnel,
    canEditPlaces,
    canViewVenues,
    canEditVenues,
    canManageQuiz: effectiveKeys.some((k) => QUIZ_MANAGER_ROLES.includes(k)),
    canManageExamRounds: effectiveKeys.some((k) => EXAM_ROUND_MANAGER_ROLES.includes(k)),
    settings,
  };
});

export type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
