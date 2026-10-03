import type { Metadata } from "next";

import { UnderConstruction } from "@/components/under-construction";
import { requireMenu } from "@/lib/auth/guards";
import { findWorkspaceMenu } from "@/lib/site";

const menu = findWorkspaceMenu("/app/places");

export const metadata: Metadata = { title: menu.title };

export default async function PlacesPage() {
  await requireMenu(menu.href);
  return <UnderConstruction title={menu.title} description={menu.description} />;
}
