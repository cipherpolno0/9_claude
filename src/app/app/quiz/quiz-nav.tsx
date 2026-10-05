import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", href: "/app/quiz", label: "ภาพรวมคลัง" },
  { key: "questions", href: "/app/quiz/questions", label: "จัดการข้อสอบ" },
  { key: "courses", href: "/app/quiz/courses", label: "รายวิชาและหน่วยการเรียน" },
  { key: "lessons", href: "/app/quiz/lessons", label: "บทเรียน" },
  { key: "stats", href: "/app/quiz/stats", label: "สถิติ" },
] as const;

/** แถบหัวข้อของคลังข้อสอบ ใช้ทุกหน้าของผู้จัดการคลังข้อสอบ */
export function QuizNav({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="หัวข้อของคลังข้อสอบ" className="mt-6 flex flex-wrap gap-1 border-b" data-testid="quiz-nav">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
            t.key === current ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
