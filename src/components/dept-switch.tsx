"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  DEFAULT_DEPARTMENT,
  DEPARTMENT_LABEL,
  DEPARTMENTS,
  DEPT_COOKIE,
  DEPT_PARAM,
  deptPage,
  isDepartment,
  type Department,
} from "@/lib/department";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "dept-change";

function readCookie(): Department {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${DEPT_COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isDepartment(value) ? value : DEFAULT_DEPARTMENT;
}

function writeCookie(dept: Department) {
  // อ่านได้ทั้งฝั่งเบราว์เซอร์และเซิร์ฟเวอร์ (หน้าที่อ่านฐานข้อมูลใช้ cookies() ในบทต่อไป) ไม่ใช่ข้อมูลลับ
  document.cookie = `${DEPT_COOKIE}=${dept}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: dept }));
}

/** แผนกที่เลือกไว้ (อ่านจากคุกกี้ฝั่งเบราว์เซอร์ หน้าคงที่จึงไม่ต้องอ่านฐานข้อมูล) ก่อนอ่านคุกกี้ได้ใช้ค่าเริ่มต้น */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function useDepartment(): Department {
  return useSyncExternalStore(subscribe, readCookie, () => DEFAULT_DEPARTMENT);
}

/**
 * สวิตช์แผนก "นักธรรม-ธรรมศึกษา | บาลี" (วางบนแถบบนของทั้งสองโซนที่เดียว)
 * แสดงเฉพาะหน้าที่มีทั้งสองแผนก (กำหนดใน src/lib/department.ts) หน้าอื่นซ่อน
 */
export function DeptSwitch({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const selected = useDepartment();
  const page = deptPage(pathname);

  // หน้าคู่: แผนกของหน้ากำหนดด้วยที่อยู่ เปิดหน้าแล้วจำแผนกนั้นไว้ / หน้าร่วม: ?dept= ชนะคุกกี้และถูกจำไว้
  useEffect(() => {
    const p = deptPage(pathname);
    if (!p) return;
    const wanted = p.kind === "pair" ? p.side : new URLSearchParams(window.location.search).get(DEPT_PARAM);
    if (isDepartment(wanted) && wanted !== readCookie()) writeCookie(wanted);
  }, [pathname]);

  if (!page) return null;
  const current: Department = page.kind === "pair" ? page.side : selected;

  const choose = (to: Department) => {
    if (to === current) return;
    writeCookie(to);
    if (page.kind === "pair") {
      router.push(page.hrefs[to]);
    } else {
      const params = new URLSearchParams(window.location.search);
      params.set(DEPT_PARAM, to);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
      router.refresh();
    }
  };

  return (
    <div
      role="group"
      aria-label="เลือกระบบ นักธรรม-ธรรมศึกษา หรือ บาลี"
      data-testid="dept-switch"
      data-current={current}
      className={cn(
        "inline-flex shrink-0 rounded-full p-0.5 text-sm font-semibold",
        tone === "dark" ? "bg-black/25" : "border bg-muted",
        className,
      )}
    >
      {DEPARTMENTS.map((d) => {
        const active = d === current;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            data-dept={d}
            onClick={() => choose(d)}
            className={cn(
              "min-h-9 rounded-full px-3 whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              tone === "dark"
                ? active
                  ? "bg-gold text-gold-foreground"
                  : "text-primary-foreground hover:bg-white/15"
                : active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent",
            )}
          >
            {/* จอเล็กใช้ชื่อสั้น */}
            <span className="md:hidden">{d === "dhamma" ? "ธรรม" : "บาลี"}</span>
            <span className="hidden md:inline">{DEPARTMENT_LABEL[d]}</span>
          </button>
        );
      })}
    </div>
  );
}
