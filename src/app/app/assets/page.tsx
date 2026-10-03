import type { Metadata } from "next";

import { UnderConstruction } from "@/components/under-construction";
import { findWorkspaceMenu } from "@/lib/site";

const menu = findWorkspaceMenu("/app/assets");

export const metadata: Metadata = { title: menu.title };

export default function AssetsPage() {
  return <UnderConstruction title={menu.title} description={menu.description} />;
}
