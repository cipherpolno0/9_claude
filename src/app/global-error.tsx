"use client";

import "./globals.css";

import { ErrorView } from "@/components/error-view";

/** ข้อผิดพลาดที่ layout หลัก (ต้องมี html และ body ของตนเอง) */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="th">
      <body>
        <title>ระบบขัดข้องชั่วคราว</title>
        <ErrorView error={error} retry={retry} />
      </body>
    </html>
  );
}
