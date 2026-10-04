/**
 * ที่อยู่เว็บที่ผู้ใช้เปิดอยู่จริง เช่น http://localhost:3002 หรือ https://ชื่อเว็บ
 * อ่านจากหัวคำขอ (Host) เพื่อให้ถูกต้องทั้งบนเครื่องตนเองและบนเซิร์ฟเวอร์จริง
 */
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3002";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** รับเฉพาะเส้นทางภายในเว็บ กันการถูกส่งไปเว็บอื่น */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
