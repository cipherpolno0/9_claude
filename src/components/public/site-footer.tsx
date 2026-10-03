import Link from "next/link";

import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-4 border-gold bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">{site.shortName}</p>
        <Link
          href="/contact"
          className="w-fit underline underline-offset-4 hover:text-gold"
        >
          ติดต่อเรา
        </Link>
      </div>
    </footer>
  );
}
