import {
  Archive,
  BookOpenCheck,
  ClipboardList,
  FileCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Map as MapIcon,
  Mail,
  MapPinned,
  Network,
  Settings,
  FlaskConical,
  GraduationCap,
  History,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { REGISTRY_BASE, REGISTRY_KINDS } from "@/lib/registry";

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
  /** เมนูย่อย (ใช้กับเมนูสาธารณะ) */
  children?: { title: string; href: string }[];
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
    children: [
      ...REGISTRY_KINDS.map((k) => ({ title: k.title, href: `${REGISTRY_BASE}/${k.slug}` })),
      { title: "ทำเนียบผู้ดำรงตำแหน่ง", href: "/directory/officers" },
    ],
  },
  {
    title: "สอบธรรมสนามหลวง",
    href: "/exams",
    description: "ตรวจรายชื่อผู้ขอเข้าสอบ และค้นผลสอบนักธรรม-ธรรมศึกษา",
    children: [
      { title: "ตรวจรายชื่อผู้ขอเข้าสอบ", href: "/exams/check" },
      { title: "สถิติสมัครสอบ", href: "/exams/stats" },
      { title: "ค้นผลสอบ", href: "/exams/results" },
      { title: "สถิติผลสอบ", href: "/exams/result-stats" },
    ],
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

/** เมนูผู้ดูแลระบบ (/app/admin) แสดงเฉพาะผู้ดูแลระบบและผู้อนุมัติบัญชี */
export const adminRoot: MenuItem = {
  title: "ผู้ดูแลระบบ",
  href: "/app/admin",
  description: "บัญชีผู้ใช้ สิทธิ์ และข้อมูลกลางของทั้งเว็บ",
  icon: Settings,
};

export type AdminMenuItem = MenuItem & { adminOnly: boolean };

/** adminOnly = เฉพาะผู้ดูแลระบบ / ไม่ใช่ = ผู้อนุมัติบัญชี (เจ้าคณะ รองเจ้าคณะ เลขานุการ ส่วนกลาง) เห็นด้วย */
export const adminMenu: AdminMenuItem[] = [
  {
    title: "บัญชีผู้ใช้",
    href: "/app/admin/users",
    description: "พิจารณาคำขอบัญชี กำหนดบทบาท ระงับและเปิดใช้บัญชี",
    icon: UserCog,
    adminOnly: false,
  },
  {
    title: "ทบทวนสิทธิ์ประจำปี",
    href: "/app/admin/access-review",
    description: "ยืนยันรายชื่อบัญชีในหน่วยปีละครั้ง (คงไว้ / ระงับ)",
    icon: ShieldCheck,
    adminOnly: false,
  },
  {
    title: "เขตปกครอง",
    href: "/app/admin/org-units",
    description: "ต้นไม้ ส่วนกลาง ภาค จังหวัด อำเภอ ตำบล แยกนิกาย และนำเข้าจาก Excel",
    icon: Network,
    adminOnly: true,
  },
  {
    title: "เขตการปกครองบ้านเมือง",
    href: "/app/admin/civil-areas",
    description: "จังหวัด อำเภอ ตำบล และรหัสไปรษณีย์ สำหรับตัวเลือกที่อยู่ นำเข้าและส่งออก Excel",
    icon: MapIcon,
    adminOnly: true,
  },
  {
    title: "บทบาทและค่าตั้ง",
    href: "/app/admin/settings",
    description: "บทบาทที่บังคับยืนยันตัวตน 2 ขั้น อายุรหัสผ่าน และเกณฑ์ระงับบัญชี",
    icon: SlidersHorizontal,
    adminOnly: true,
  },
  {
    title: "สิทธิ์ตามบทบาท",
    href: "/app/admin/permissions",
    description: "กำหนดว่าแต่ละบทบาทใช้เมนูใดได้ และดูหรือแก้ไขทะเบียนบุคคลได้กว้างเพียงใด",
    icon: KeyRound,
    adminOnly: true,
  },
  {
    title: "ประเภทตำแหน่ง จศป.",
    href: "/app/admin/education-positions",
    description: "ประเภทตำแหน่งของ จศป. แยกตามแท่ง: แผนกธรรม แผนกบาลี แผนกสามัญ ปริยัตินิเทศก์",
    icon: GraduationCap,
    adminOnly: true,
  },
  {
    title: "รายการเอกสารของคำขอ",
    href: "/app/admin/request-documents",
    description: "เอกสารที่ต้องแนบกับคำขอจัดตั้ง-ยุบสำนัก และคำขอเปิด-ปิด-ย้ายสนามสอบ ตามระเบียบ",
    icon: FileCheck,
    adminOnly: true,
  },
  {
    title: "แบบฟอร์มบัญชี ศ.",
    href: "/app/admin/form-templates",
    description: "หัวตาราง ชนิดข้อมูล บังคับกรอก กฎตรวจ ของแม่แบบ Excel สมัครสอบ และรายการคำนำหน้าชื่อ",
    icon: FileSpreadsheet,
    adminOnly: true,
  },
  {
    title: "ประวัติการแก้ไข",
    href: "/app/admin/audit",
    description: "ใคร ทำอะไร กับข้อมูลใด เมื่อใด ค้นและกรองได้",
    icon: History,
    adminOnly: true,
  },
  {
    title: "สาธิตชิ้นส่วนกลาง",
    href: "/app/admin/demo",
    description: "ตารางข้อมูล ตัวเลือกเขตปกครอง ไฟล์แนบ แจ้งเตือน เครื่องอนุมัติกลาง หน้าพิมพ์",
    icon: FlaskConical,
    adminOnly: false,
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
