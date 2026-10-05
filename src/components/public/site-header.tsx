"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogIn, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { loginPath, publicMenu, site, type MenuItem } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** เมนูหลักถือว่าเปิดอยู่เมื่ออยู่ในหน้าของเมนูนั้นหรือหน้าของเมนูย่อย (เช่น ทำเนียบ อยู่ใต้เมนู ทะเบียน) */
function isMenuActive(pathname: string, item: MenuItem) {
  return isActive(pathname, item.href) || (item.children ?? []).some((c) => isActive(pathname, c.href));
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b-4 border-gold bg-primary text-primary-foreground">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-bold text-gold-foreground"
          >
            ธ
          </span>
          <span className="truncate text-lg font-bold">{site.shortName}</span>
        </Link>

        {/* เมนูจอใหญ่ */}
        <nav aria-label="เมนูหลัก" className="ml-auto hidden xl:block">
          <ul className="flex items-center gap-1">
            {publicMenu.map((item) => {
              const active = isMenuActive(pathname, item);
              return (
                <li key={item.href} className="group relative">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-haspopup={item.children ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-3 py-2 font-medium whitespace-nowrap transition-colors hover:bg-white/15",
                      active && "bg-white/15 text-gold",
                    )}
                  >
                    {item.title}
                    {item.children ? <ChevronDown className="size-4" aria-hidden /> : null}
                  </Link>
                  {item.children ? (
                    // เมนูย่อย: เปิดเมื่อชี้เมาส์หรือเมื่อใช้แป้น Tab เข้ามา (focus-within)
                    <ul
                      aria-label={`เมนูย่อยของ ${item.title}`}
                      data-testid="submenu"
                      className="invisible absolute top-full left-0 z-50 min-w-56 rounded-b-md border border-t-0 bg-card py-1 text-card-foreground opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                    >
                      {item.children.map((child) => (
                        <li key={child.href}>
                          {/* ปิด prefetch: เมนูย่อยชี้ไปหน้าค้นหาที่อ่านฐานข้อมูล ไม่ควรโหลดล่วงหน้าทุกครั้งที่เปิดหน้าใดก็ตาม */}
                          <Link
                            href={child.href}
                            prefetch={false}
                            aria-current={isActive(pathname, child.href) ? "page" : undefined}
                            className={cn(
                              "block px-4 py-2 whitespace-nowrap hover:bg-secondary",
                              isActive(pathname, child.href) && "bg-secondary font-semibold text-primary",
                            )}
                          >
                            {child.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <Button asChild variant="gold" className="ml-auto hidden sm:inline-flex xl:ml-2">
          <Link href={loginPath}>
            <LogIn aria-hidden />
            เข้าสู่ระบบ
          </Link>
        </Button>

        {/* เมนูมือถือ */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto hover:bg-white/15 hover:text-primary-foreground sm:ml-0 xl:hidden"
            >
              <Menu className="size-6" aria-hidden />
              <span className="sr-only">เปิดเมนู</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="[&>button]:text-primary-foreground">
            <div className="border-b-4 border-gold bg-primary px-4 py-4 text-primary-foreground">
              <SheetTitle>เมนู</SheetTitle>
              <SheetDescription className="text-primary-foreground/80">
                {site.shortName}
              </SheetDescription>
            </div>
            <nav aria-label="เมนูหลัก (มือถือ)" className="flex-1 overflow-y-auto p-3">
              <ul className="flex flex-col gap-1">
                {publicMenu.map((item) => {
                  const active = isMenuActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block rounded-md px-3 py-3 text-lg font-medium hover:bg-accent",
                            active && "bg-accent font-semibold text-primary",
                          )}
                        >
                          {item.title}
                        </Link>
                      </SheetClose>
                      {item.children ? (
                        <ul aria-label={`เมนูย่อยของ ${item.title}`} className="mb-1 ml-4 flex flex-col border-l-2 border-input">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <SheetClose asChild>
                                <Link
                                  href={child.href}
                                  prefetch={false}
                                  aria-current={isActive(pathname, child.href) ? "page" : undefined}
                                  className={cn(
                                    "block rounded-r-md px-3 py-2 hover:bg-accent",
                                    isActive(pathname, child.href) && "bg-accent font-semibold text-primary",
                                  )}
                                >
                                  {child.title}
                                </Link>
                              </SheetClose>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t p-3">
              <SheetClose asChild>
                <Button asChild size="lg" className="w-full">
                  <Link href={loginPath}>
                    <LogIn aria-hidden />
                    เข้าสู่ระบบ
                  </Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
