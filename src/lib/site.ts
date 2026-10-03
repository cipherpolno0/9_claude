import {
  Archive,
  BookOpenCheck,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Mail,
  MapPinned,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** ข้อมูลกลางของเว็บ แก้ที่นี่ที่เดียว */
export const site = {
  name: "เว็บไซต์กองบริหารทะเบียนและวัดผล",
  shortName: "กองบริหารทะเบียนและวัดผล",
  description:
    "เว็บรวมระบบงานการศึกษาและการปกครองคณะสงฆ์ไว้ในเว็บเดียว",
};

export type MenuItem = {
  title: string;
  href: string;
  /** คำอธิบายสั้นที่แสดงในหน้าว่าง */
  description: string;
  icon?: LucideIcon;
};

/** เมนูโซนสาธารณะ 7 เมนู (ไม่ต้องล็อกอิน) */
export const publicMenu: MenuItem[] = [
  {
    title: "หน้าแรก",
    href: "/",
    description: "ข่าวประกาศ ทางลัด และภาพรวมของเว็บไซต์",
  },
  {
    title: "ทะเบียน",
    href: "/registry",
    description: "ค้นหาทะเบียนสำนักเรียน วัด สถานศึกษา สนามสอบ และทำเนียบบุคลากร",
  },
  {
    title: "สอบธรรมสนามหลวง",
    href: "/exams",
    description: "ตรวจรายชื่อผู้ขอเข้าสอบ และค้นผลสอบนักธรรม-ธรรมศึกษา",
  },
  {
    title: "ติดตามคำขอ",
    href: "/track",
    description: "ติดตามสถานะคำขอจัดตั้ง-ยุบสำนักเรียน และเปิด-ปิด-ย้ายสนามสอบ",
  },
  {
    title: "คลังข้อสอบ",
    href: "/quiz",
    description: "แบบทดสอบก่อนเรียน บทเรียน และแบบทดสอบหลังเรียน ธรรมศึกษา",
  },
  {
    title: "ดาวน์โหลด",
    href: "/downloads",
    description: "แบบฟอร์ม แม่แบบ Excel คู่มือ ปฏิทิน ระเบียบและประกาศ",
  },
  {
    title: "ติดต่อเรา",
    href: "/contact",
    description: "ที่อยู่ โทรศัพท์ อีเมล แผนที่ และแบบฟอร์มส่งข้อความ",
  },
];

export const loginPath = "/login";

export type MenuGroup = { label: string | null; items: MenuItem[] };

/** เมนูโซนพื้นที่ทำงาน 9 เมนู (ต้องล็อกอิน) จัดเป็น 3 กลุ่ม */
export const workspaceMenu: MenuGroup[] = [
  {
    label: null,
    items: [
      {
        title: "แดชบอร์ด",
        href: "/app",
        description: "งานรอพิจารณา แจ้งเตือน และทางลัดตามบทบาท",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "บุคคลและทะเบียน",
    items: [
      {
        title: "บุคลากร",
        href: "/app/personnel",
        description: "ทะเบียนบุคลากรคณะสงฆ์และฝ่ายการศึกษา (ระบบที่ 1)",
        icon: Users,
      },
      {
        title: "ทะเบียนสถานที่",
        href: "/app/places",
        description: "ทะเบียนสำนักเรียน วัด สถานศึกษา และสนามสอบ (ระบบที่ 2)",
        icon: MapPinned,
      },
      {
        title: "คำขอ",
        href: "/app/requests",
        description:
          "คำขอจัดตั้ง-ยุบสำนักเรียน และเปิด-ปิด-ย้ายสนามสอบ (ระบบที่ 4)",
        icon: ClipboardList,
      },
    ],
  },
  {
    label: "การสอบและการเรียน",
    items: [
      {
        title: "สมัครสอบและผลสอบ",
        href: "/app/exams",
        description:
          "สมัครสอบด้วยไฟล์ Excel บัญชี ศ. และผลสอบ (ระบบที่ 9 และ 5)",
        icon: FileSpreadsheet,
      },
      {
        title: "คลังข้อสอบ",
        href: "/app/quiz",
        description: "จัดการคลังข้อสอบและบทเรียนธรรมศึกษา (ระบบที่ 3)",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    label: "งานสำนักงาน",
    items: [
      {
        title: "สารบรรณ",
        href: "/app/docs",
        description: "หนังสือรับ-ส่ง และหนังสือเวียน (ระบบที่ 8)",
        icon: Mail,
      },
      {
        title: "งบประมาณ",
        href: "/app/budget",
        description: "แผนงบประมาณ การจัดสรร และการเบิกจ่าย (ระบบที่ 6)",
        icon: Wallet,
      },
      {
        title: "พัสดุ-ครุภัณฑ์",
        href: "/app/assets",
        description: "คลังวัสดุและทะเบียนครุภัณฑ์ (ระบบที่ 7)",
        icon: Archive,
      },
    ],
  },
];

export function findPublicMenu(href: string): MenuItem {
  const item = publicMenu.find((m) => m.href === href);
  if (!item) throw new Error(`ไม่พบเมนูสาธารณะ: ${href}`);
  return item;
}

export function findWorkspaceMenu(href: string): MenuItem {
  const item = workspaceMenu.flatMap((g) => g.items).find((m) => m.href === href);
  if (!item) throw new Error(`ไม่พบเมนูพื้นที่ทำงาน: ${href}`);
  return item;
}
