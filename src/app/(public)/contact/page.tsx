import type { Metadata } from "next";

import { UnderConstruction } from "@/components/under-construction";
import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/contact");

export const metadata: Metadata = { title: menu.title };

export default function ContactPage() {
  return <UnderConstruction title={menu.title} description={menu.description} />;
}
