import type { Metadata } from "next";

import { requireAccountManager } from "@/lib/auth/guards";
import { LEVEL_LABEL, SECT_LABEL } from "@/lib/org-units";
import { thaiDate } from "@/lib/thai";

import { demoTableParams, queryDemoUnits } from "../query";
import { DemoPrintSheet } from "./print-sheet";

export const metadata: Metadata = { title: "ตัวอย่างหน้าพิมพ์" };
export const dynamic = "force-dynamic";

export default async function DemoPrintPage() {
  await requireAccountManager();
  const { rows } = await queryDemoUnits(demoTableParams({}), true);
  return (
    <DemoPrintSheet
      printedOn={thaiDate(new Date())}
      rows={rows.slice(0, 40).map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        level: LEVEL_LABEL[u.level],
        sect: u.sect ? SECT_LABEL[u.sect] : "-",
      }))}
    />
  );
}
