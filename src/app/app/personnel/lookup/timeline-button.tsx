"use client";

import { useState, useTransition } from "react";
import { History } from "lucide-react";

import { ErrorText } from "@/components/form";
import { StatusTimeline } from "@/components/status-timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { loadStatusTimeline, type TimelineResult } from "./actions";

/** ปุ่ม "เส้นเวลา" ในหน้าตรวจสอบ: เปิดหน้าต่างแสดงเส้นเวลาสถานะของบุคคล */
export function TimelineButton({ personId, name }: { personId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [pending, startTransition] = useTransition();

  const show = () => {
    setOpen(true);
    startTransition(async () => setResult(await loadStatusTimeline(personId)));
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={show} aria-label={`ดูเส้นเวลาสถานะ: ${name}`}>
        <History aria-hidden />
        เส้นเวลา
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เส้นเวลาสถานะ</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          {pending || !result ? (
            <p className="text-muted-foreground">กำลังโหลด...</p>
          ) : result.ok ? (
            <div className="max-h-[60vh] overflow-y-auto">
              <StatusTimeline changes={result.changes} personType={result.personType} currentStatus={result.status} />
            </div>
          ) : (
            <ErrorText>{result.error}</ErrorText>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
