"use client";

import Link from "next/link";
import { Bell, CircleUserRound, Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WorkspaceBrand, WorkspaceNav } from "./workspace-nav";

export function WorkspaceTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-4">
      {/* เมนูมือถือ */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="size-6" aria-hidden />
            <span className="sr-only">เปิดเมนู</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="[&>button]:text-primary-foreground">
          <SheetTitle className="sr-only">เมนูพื้นที่ทำงาน</SheetTitle>
          <SheetDescription className="sr-only">
            เลือกระบบงานที่ต้องการ
          </SheetDescription>
          <WorkspaceBrand />
          <div className="flex-1 overflow-y-auto">
            <WorkspaceNav
              wrapLink={(link, key) => (
                <SheetClose asChild key={key}>
                  {link}
                </SheetClose>
              )}
            />
          </div>
        </SheetContent>
      </Sheet>

      <form role="search" className="relative min-w-0 flex-1 sm:max-w-md" action="#">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          aria-label="ค้นหา"
          placeholder="ค้นหา..."
          className="pl-10"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="icon" type="button">
          <Bell aria-hidden />
          <span className="sr-only">การแจ้งเตือน</span>
        </Button>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <CircleUserRound className="size-7 shrink-0 text-primary" aria-hidden />
          <span className="hidden font-medium sm:inline">ผู้ใช้ทดสอบ</span>
        </div>
        <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
          <Link href="/">กลับหน้าเว็บ</Link>
        </Button>
      </div>
    </header>
  );
}
