import Link from "next/link";

import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-4 border-gold bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">{site.shortName}</p>
        <nav aria-label="ลิงก์ท้ายเว็บ" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/contact" className="w-fit underline underline-offset-4 hover:text-gold">
            ติดต่อเรา
          </Link>
          <Link href="/privacy" prefetch={false} className="w-fit underline underline-offset-4 hover:text-gold">
            นโยบายความเป็นส่วนตัว
          </Link>
        </nav>
      </div>
    </footer>
  );
}
