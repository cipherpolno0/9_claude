"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** ชิ้นส่วนฟอร์มกลาง ใช้ซ้ำทุกหน้า */

export type FormState = { error?: string; message?: string } | null;

export function Field({
  label,
  name,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; hint?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={name}>
        {label}
        {props.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input id={name} name={name} {...props} />
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 font-medium text-destructive">
      {children}
    </p>
  );
}

export function InfoText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-md border border-input bg-secondary px-3 py-2 font-medium text-primary">
      {children}
    </p>
  );
}

export function FormMessages({ state }: { state: FormState }) {
  return (
    <>
      <ErrorText>{state?.error}</ErrorText>
      <InfoText>{state?.message}</InfoText>
    </>
  );
}

/**
 * ส่งฟอร์มไปยัง Server Action โดยไม่ล้างค่าที่ผู้ใช้กรอกไว้เมื่อเกิดข้อผิดพลาด
 * ใช้: const { state, onSubmit, pending } = useServerForm(action)
 */
export function useServerForm(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, setState] = useState<FormState>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setState(await action(null, formData));
    });
  };
  return { state, onSubmit, pending };
}

export function SubmitButton({
  children,
  pending = false,
  pendingText = "กำลังดำเนินการ...",
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean; pendingText?: string }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";
