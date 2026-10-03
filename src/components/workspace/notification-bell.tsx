"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notifications/actions";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

/** กระดิ่งแจ้งเตือนบนแถบบน: ตรวจรายการใหม่ทุก 1 นาที และทุกครั้งที่กดเปิด */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMyNotifications();
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      // เครือข่ายสะดุด: รอรอบถัดไป
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const openItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.read_at) {
      await markNotificationRead(item.id);
      load();
    }
    if (item.link?.startsWith("/")) router.push(item.link);
  };

  return (
    <div className="relative" ref={boxRef}>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
      >
        <Bell aria-hidden />
        <span className="sr-only">การแจ้งเตือน{unread > 0 ? ` ยังไม่อ่าน ${unread} รายการ` : ""}</span>
        {unread > 0 ? (
          <span
            aria-hidden
            data-testid="unread-count"
            className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="การแจ้งเตือน"
          className="fixed inset-x-3 top-[4.25rem] z-40 flex max-h-[70vh] flex-col rounded-xl border bg-background shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <p className="font-bold text-primary">การแจ้งเตือน</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-sm text-primary underline underline-offset-4"
                onClick={async () => {
                  await markAllNotificationsRead();
                  load();
                }}
              >
                อ่านทั้งหมดแล้ว
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            <ul className="overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn("block w-full px-4 py-2 text-left hover:bg-muted", !item.read_at && "bg-secondary")}
                  >
                    <span className={cn("block", !item.read_at && "font-semibold")}>{item.title}</span>
                    {item.body ? <span className="block text-sm text-muted-foreground">{item.body}</span> : null}
                    <span className="block text-sm text-muted-foreground">{thaiDateTime(item.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
