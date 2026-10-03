"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { site, workspaceMenu } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

/** รายการเมนูพื้นที่ทำงาน ใช้ทั้งแถบข้างจอใหญ่และเมนูเลื่อนบนมือถือ */
export function WorkspaceNav({
  wrapLink,
}: {
  /** ใช้ห่อลิงก์ เช่น ให้ปิดเมนูเลื่อนเมื่อกดบนมือถือ */
  wrapLink?: (link: React.ReactElement, key: string) => React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูพื้นที่ทำงาน" className="flex flex-col gap-4 p-3">
      {workspaceMenu.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="px-3 pb-1 text-sm font-semibold text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 font-medium hover:bg-accent",
                    active && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {Icon ? <Icon className="size-5 shrink-0" aria-hidden /> : null}
                  {item.title}
                </Link>
              );
              return (
                <li key={item.href}>
                  {wrapLink ? wrapLink(link, item.href) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function WorkspaceBrand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b-4 border-gold bg-primary px-4 text-primary-foreground">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-gold-foreground"
      >
        ธ
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-bold">พื้นที่ทำงาน</p>
        <p className="truncate text-sm text-primary-foreground/80">
          {site.shortName}
        </p>
      </div>
    </div>
  );
}
