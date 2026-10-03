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
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.shortName}` },
  description: site.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4e2d12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
