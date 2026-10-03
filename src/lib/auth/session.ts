import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { ACCOUNT_MANAGER_ROLES, ROLE_MENUS } from "./config";

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

  const [profileRes, rolesRes, aalRes, settingsRes, factorsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_role_rows"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("app_settings").select("key, value_int"),
    supabase.auth.mfa.listFactors(),
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

  const allowedMenus = new Set<string>(["/app"]);
  let allMenus = false;
  for (const key of roleKeys) {
    const menus = ROLE_MENUS[key];
    if (menus === "*") allMenus = true;
    else menus?.forEach((m) => allowedMenus.add(m));
  }

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
    settings,
  };
});

export type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
