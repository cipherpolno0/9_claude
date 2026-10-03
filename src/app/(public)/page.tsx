import { UnderConstruction } from "@/components/under-construction";
import { findPublicMenu, site } from "@/lib/site";

const menu = findPublicMenu("/");

export default function HomePage() {
  return <UnderConstruction title={site.name} description={menu.description} />;
}
