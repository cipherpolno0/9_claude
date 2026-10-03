"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { loginPath, publicMenu, site } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 font-medium whitespace-nowrap transition-colors hover:bg-white/15",
                      active && "bg-white/15 text-gold",
                    )}
                  >
                    {item.title}
                  </Link>
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
                  const active = isActive(pathname, item.href);
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
