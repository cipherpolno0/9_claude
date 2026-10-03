"use server";

import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** แจ้งเตือนล่าสุด 15 รายการ และจำนวนที่ยังไม่อ่าน ของผู้ใช้ปัจจุบัน */
export async function getMyNotifications(): Promise<{ unread: number; items: NotificationItem[] }> {
  const supabase = await createClient();
  const [items, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  return { unread: unread.count ?? 0, items: (items.data as NotificationItem[] | null) ?? [] };
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}
