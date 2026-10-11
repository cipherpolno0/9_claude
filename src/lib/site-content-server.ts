import "server-only";

import { createHmac } from "node:crypto";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

import {
  SITE_TAG,
  type AdminAnnouncement,
  type AdminDownload,
  type AnnouncementDetail,
  type CalendarEventRow,
  type CalendarRow,
  type ContactMessage,
  type DownloadItem,
  type HomeStats,
  type PublicAnnouncement,
  type SearchGroups,
  type SiteContact,
} from "./site-content";

// ---------------------------------------------------------------
// หน้าสาธารณะ (อ่านในนาม anon แคช 5 นาที ล้างทันทีเมื่อผู้จัดการเนื้อหาแก้: revalidateTag(SITE_TAG))
// ---------------------------------------------------------------
export const fetchHomeStats = unstable_cache(
  async (): Promise<HomeStats> => {
    const { data, error } = await createPublicClient().rpc("public_home_stats");
    if (error) throw new Error(error.message);
    const v = (data ?? {}) as Partial<HomeStats>;
    return { year_be: v.year_be ?? null, samnak: v.samnak ?? 0, venues: v.venues ?? 0, candidates: v.candidates ?? 0 };
  },
  ["public-home-stats"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

export const fetchPublicAnnouncements = unstable_cache(
  async (limit: number, offset: number): Promise<PublicAnnouncement[]> => {
    const { data, error } = await createPublicClient().rpc("public_announcements", { p_limit: limit, p_offset: offset });
    if (error) throw new Error(error.message);
    return (data as PublicAnnouncement[] | null) ?? [];
  },
  ["public-announcements"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

export const fetchPublicAnnouncement = unstable_cache(
  async (id: string): Promise<AnnouncementDetail | null> => {
    const { data, error } = await createPublicClient().rpc("public_announcement", { p_id: id });
    if (error) throw new Error(error.message);
    return (data as AnnouncementDetail | null) ?? null;
  },
  ["public-announcement"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

export const fetchExamCalendar = unstable_cache(
  async (): Promise<CalendarRow[]> => {
    const { data, error } = await createPublicClient().rpc("public_exam_calendar");
    if (error) throw new Error(error.message);
    return (data as CalendarRow[] | null) ?? [];
  },
  ["public-exam-calendar"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

export const fetchPublicDownloads = unstable_cache(
  async (): Promise<DownloadItem[]> => {
    const { data, error } = await createPublicClient().rpc("public_downloads");
    if (error) throw new Error(error.message);
    return (data as DownloadItem[] | null) ?? [];
  },
  ["public-downloads"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

export const fetchSiteContact = unstable_cache(
  async (): Promise<SiteContact | null> => {
    const { data, error } = await createPublicClient().rpc("public_site_contact");
    if (error) throw new Error(error.message);
    const v = data as SiteContact | null;
    if (!v) return null;
    return {
      ...v,
      latitude: v.latitude === null ? null : Number(v.latitude),
      longitude: v.longitude === null ? null : Number(v.longitude),
      topics: v.topics ?? [],
    };
  },
  ["public-site-contact"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [SITE_TAG] },
);

/** รหัสเครื่องผู้ส่งข้อความ: ที่อยู่ IP เข้ารหัสทางเดียวด้วยกุญแจลับของเว็บ (ฐานข้อมูลไม่เห็นที่อยู่จริง) */
export async function contactClientHash(secret: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
  return createHmac("sha256", secret).update(`contact|${ip}`).digest("hex");
}

// ---------------------------------------------------------------
// พื้นที่ทำงาน (ในนามผู้ใช้ RLS ตรวจสิทธิ์)
// ---------------------------------------------------------------
export async function fetchAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, is_pinned, published_on, expires_on, is_active, updated_at, files:announcement_files(id, file_name, storage_path, mime_type, size_bytes, is_active)")
    .order("is_active", { ascending: false })
    .order("is_pinned", { ascending: false })
    .order("published_on", { ascending: false });
  return (data as AdminAnnouncement[] | null) ?? [];
}

export async function fetchAdminDownloads(): Promise<AdminDownload[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("downloads")
    .select("id, category, title, description, storage_path, file_name, mime_type, size_bytes, url, sort_order, is_active, updated_at")
    .order("category")
    .order("sort_order")
    .order("title");
  return (data as AdminDownload[] | null) ?? [];
}

export async function fetchCalendarEvents(yearId: string): Promise<CalendarEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_calendar_events")
    .select("id, academic_year_id, starts_on, ends_on, title, note, is_active")
    .eq("academic_year_id", yearId)
    .order("is_active", { ascending: false })
    .order("starts_on");
  return (data as CalendarEventRow[] | null) ?? [];
}

export type ContactSettings = {
  agency_name: string;
  address: string;
  phone: string;
  email: string;
  office_hours: string;
  latitude: number | null;
  longitude: number | null;
  map_note: string;
};

export async function fetchContactSettings(): Promise<ContactSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_contact")
    .select("agency_name, address, phone, email, office_hours, latitude, longitude, map_note")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  const v = data as ContactSettings;
  return { ...v, latitude: v.latitude === null ? null : Number(v.latitude), longitude: v.longitude === null ? null : Number(v.longitude) };
}

export type TopicRecipient = { id: string; topic_key: string; role_key: string | null; user_id: string | null; is_active: boolean };

export async function fetchTopicRecipients(): Promise<TopicRecipient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_topic_recipients")
    .select("id, topic_key, role_key, user_id, is_active")
    .eq("is_active", true)
    .order("created_at");
  return (data as TopicRecipient[] | null) ?? [];
}

export type MyContactTopic = { key: string; name: string; unread: number };

export async function fetchMyContactTopics(): Promise<MyContactTopic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_contact_topics");
  if (error) return [];
  return (data as MyContactTopic[] | null) ?? [];
}

export async function fetchContactMessages(opts: { topic?: string; status?: string; limit?: number }): Promise<ContactMessage[]> {
  const supabase = await createClient();
  let q = supabase
    .from("contact_messages")
    .select("id, topic_key, sender_name, sender_email, sender_phone, subject, message, status, staff_note, read_at, handled_at, created_at, contact_topics(name)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.topic) q = q.eq("topic_key", opts.topic);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return (data as ContactMessage[] | null) ?? [];
}

export async function fetchContactMessage(id: string): Promise<ContactMessage | null> {
  const supabase = await createClient();
  await supabase.rpc("mark_contact_message_read", { p_id: id });
  const { data } = await supabase
    .from("contact_messages")
    .select("id, topic_key, sender_name, sender_email, sender_phone, subject, message, status, staff_note, read_at, handled_at, created_at, contact_topics(name)")
    .eq("id", id)
    .maybeSingle();
  return (data as ContactMessage | null) ?? null;
}

export async function workspaceSearch(q: string): Promise<SearchGroups> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workspace_search", { p_q: q });
  if (error) return { too_short: true };
  return (data as SearchGroups | null) ?? {};
}
