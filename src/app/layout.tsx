import type { Metadata, Viewport } from "next";
import "@fontsource/sarabun/thai-400.css";
import "@fontsource/sarabun/thai-500.css";
import "@fontsource/sarabun/thai-600.css";
import "@fontsource/sarabun/thai-700.css";
import "@fontsource/sarabun/latin-400.css";
import "@fontsource/sarabun/latin-500.css";
import "@fontsource/sarabun/latin-600.css";
import "@fontsource/sarabun/latin-700.css";
import "./globals.css";
import { EnvironmentBanner } from "@/components/environment-banner";
import { ScrollRegions } from "@/components/scroll-regions";
import { appEnvironment } from "@/lib/environment";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.shortName}` },
  description: site.description,
  // ชุดทดสอบและเครื่องผู้พัฒนาไม่ให้เครื่องมือค้นหาเก็บหน้าเว็บ (บทที่ 32)
  robots: appEnvironment() === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4e2d12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <EnvironmentBanner />
        {children}
        <ScrollRegions />
      </body>
    </html>
  );
}
