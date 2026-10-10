import "server-only";

import { headers } from "next/headers";
import QRCode from "qrcode";

import { originFromHeaders } from "@/lib/auth/origin";

/** ที่อยู่หน้าครุภัณฑ์ (เปิดจากการสแกนป้าย QR ต้องล็อกอิน) */
export async function assetUrl(id: string): Promise<string> {
  return `${originFromHeaders(await headers())}/app/inventory/assets/${id}`;
}

/** ภาพ QR แบบ SVG (สร้างในเซิร์ฟเวอร์ ไม่ส่งข้อมูลออกนอกระบบ) */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
