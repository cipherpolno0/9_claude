import type { Metadata } from "next";

import { UnderConstruction } from "@/components/under-construction";
import { findWorkspaceMenu } from "@/lib/site";

const menu = findWorkspaceMenu("/app/places");

export const metadata: Metadata = { title: menu.title };

export default function PlacesPage() {
  return <UnderConstruction title={menu.title} description={menu.description} />;
}
