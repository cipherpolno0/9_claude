"use client";

import { useEffect } from "react";

/**
 * การเข้าถึงด้วยแป้นพิมพ์ (บทที่ 31): กล่องตารางที่เลื่อนซ้ายขวาได้ (.overflow-x-auto) บนจอแคบ
 * ถ้าในกล่องไม่มีลิงก์หรือปุ่มให้โฟกัส ผู้ใช้แป้นพิมพ์จะเลื่อนดูคอลัมน์ที่ถูกตัดไม่ได้
 * ชิ้นนี้ใส่ tabindex="0" role="region" และชื่อให้เฉพาะกล่องที่ล้นจริงและไม่มีสิ่งที่โฟกัสได้ (ไม่เพิ่มจุดแท็บโดยไม่จำเป็น)
 * วางไว้ที่ layout หลักครั้งเดียว ใช้ได้ทุกหน้าทั้งโซนสาธารณะและพื้นที่ทำงาน
 */
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([data-scroll-region])";

function update() {
  document.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((el) => {
    const overflowing = el.scrollWidth > el.clientWidth + 1;
    const needs = overflowing && !el.querySelector(FOCUSABLE);
    if (needs && !el.hasAttribute("data-scroll-region")) {
      el.setAttribute("data-scroll-region", "");
      el.tabIndex = 0;
      if (!el.getAttribute("role")) el.setAttribute("role", "region");
      if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "ส่วนที่เลื่อนซ้ายขวาได้ (ใช้ปุ่มลูกศร)");
    } else if (!needs && el.hasAttribute("data-scroll-region")) {
      el.removeAttribute("data-scroll-region");
      el.removeAttribute("tabindex");
      if (el.getAttribute("role") === "region") el.removeAttribute("role");
      if (el.getAttribute("aria-label") === "ส่วนที่เลื่อนซ้ายขวาได้ (ใช้ปุ่มลูกศร)") el.removeAttribute("aria-label");
    }
  });
}

export function ScrollRegions() {
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 150);
    };
    update();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return null;
}
