import type { Metadata } from "next";
import Link from "next/link";

import { PendingRequestsBox } from "@/components/pending-requests-box";
import { requireWorkspace } from "@/lib/auth/guards";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import { fetchMyPendingRequests } from "@/lib/requests/queries";
import { createClient } from "@/lib/supabase/server";
import { thaiDate } from "@/lib/thai";

export const metadata: Metadata = { title: "งานรอพิจารณา" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await requireWorkspace();
  const supabase = await createClient();
  const [pending, mine] = await Promise.all([
    fetchMyPendingRequests(),
    supabase
      .from("requests")
      .select("id, request_no, title, status, submitted_at, request_types(name)")
      .eq("requester_id", ctx.user.id)
      .order("submitted_at", { ascending: false })
      .limit(100),
  ]);
  const myRequests = (mine.data ?? []) as unknown as {
    id: string;
    request_no: string;
    title: string;
    status: RequestStatus;
    submitted_at: string;
    request_types: { name: string } | null;
  }[];

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">งานรอพิจารณาและคำขอของท่าน</h1>
      <p className="mt-1 text-muted-foreground">รวมคำขอจากทุกระบบที่ใช้เครื่องอนุมัติกลาง</p>

      <div className="mt-6">
        <PendingRequestsBox items={pending} limit={100} />
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5" data-testid="my-requests">
        <h2 className="text-xl font-bold text-primary">คำขอที่ท่านยื่น ({myRequests.length})</h2>
        {myRequests.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ท่านยังไม่เคยยื่นคำขอ</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {myRequests.map((r) => (
              <li key={r.id}>
                <Link href={`/app/approvals/${r.id}`} className="block rounded-lg border p-3 hover:bg-secondary">
                  <span className="block font-semibold">
                    {r.request_no} · {r.title}
                  </span>
                  <span className="block text-muted-foreground">
                    {r.request_types?.name} · {thaiDate(r.submitted_at, "short")} · {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
