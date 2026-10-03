import type { Metadata } from "next";

import { UnderConstruction } from "@/components/under-construction";
import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/exams");

export const metadata: Metadata = { title: menu.title };

export default function ExamsPage() {
  return <UnderConstruction title={menu.title} description={menu.description} />;
}
