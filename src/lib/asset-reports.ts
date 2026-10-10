import "server-only";

import {
  ASSET_REPORT_LABEL,
  CONDITION_LABEL,
  COUNT_RESULT_LABEL,
  METHOD_LABEL,
  countSummary,
  type AssetReportKind,
  type CountDetail,
} from "@/lib/assets";
import { fetchAssetRows, fetchCountDetail, fetchDepreciation, fetchIssueReport, fetchUnitCompare } from "@/lib/assets-server";
import type { ReportColumn, ReportTable } from "@/lib/reports";
import { thaiDate, thaiDateTime } from "@/lib/thai";

/**
 * รายงานครุภัณฑ์และวัสดุ 5 แบบ สร้างเป็น ReportTable กลาง (ใช้ทั้งบนจอ หน้าพิมพ์ และ Excel)
 * ขอบเขต: หน่วยที่เลือก (+ หน่วยใต้สังกัดเมื่อ sub) เฉพาะหน่วยที่ผู้ใช้ดูพัสดุได้ (ฐานข้อมูลกรองเอง)
 */

export type AssetReportScope = { unit: { id: string; name: string }; sub: boolean; year: number; countId: string | null };

const money = (header: string, width = 15): ReportColumn => ({ header, width, align: "right", format: "money" });
const num = (header: string, width = 11): ReportColumn => ({ header, width, align: "right" });
const n2 = (v: number | string) => Math.round(Number(v ?? 0) * 100) / 100;
const sum = (vals: (number | string)[]) => Math.round(vals.reduce<number>((s, v) => s + Number(v ?? 0) * 100, 0)) / 100;
const scopeText = (s: AssetReportScope) => `${s.unit.name}${s.sub ? " (รวมหน่วยใต้สังกัด)" : " (เฉพาะหน่วยนี้)"}`;
const fy = (y: number) => `ปีงบประมาณ ${y} (1 ต.ค. ${y - 1} – 30 ก.ย. ${y})`;

async function registerReport(s: AssetReportScope): Promise<ReportTable> {
  const rows = await fetchAssetRows(s.unit.id, s.sub);
  return {
    kind: "asset-register",
    title: ASSET_REPORT_LABEL.register,
    subtitle: `${scopeText(s)} · ข้อมูล ณ ${thaiDate(new Date().toISOString())}`,
    note: "ค่าเสื่อมราคาแบบเส้นตรงตามจำนวนวันจริง เหลือมูลค่าซาก 1 บาท คำนวณถึงวันนี้ (จำหน่ายแล้วคิดถึงวันจำหน่าย)",
    columns: [
      { header: "เลขครุภัณฑ์", width: 16 },
      { header: "ชื่อ", width: 28 },
      { header: "ประเภท", width: 18 },
      { header: "ยี่ห้อ รุ่น หมายเลขเครื่อง", width: 26 },
      { header: "วันที่ได้มา", width: 13 },
      { header: "วิธีได้มา", width: 9 },
      money("ราคา"),
      { header: "แหล่งเงิน", width: 16 },
      num("อายุ (ปี)", 8),
      { header: "หน่วยที่ครอบครอง", width: 24 },
      { header: "สถานที่ตั้ง", width: 18 },
      { header: "ผู้รับผิดชอบ", width: 18 },
      { header: "สภาพ", width: 12 },
      money("ค่าเสื่อมสะสม"),
      money("มูลค่าสุทธิ"),
    ],
    rows: rows.map((a) => [
      a.asset_no,
      a.name,
      a.type_name,
      [a.brand, a.model, a.serial_no].filter(Boolean).join(" / "),
      thaiDate(a.acquired_on, "short"),
      METHOD_LABEL[a.acquire_method],
      n2(a.price),
      a.source_name ?? "",
      a.life_years,
      a.unit_name,
      a.location,
      a.custodian,
      CONDITION_LABEL[a.condition] + (a.disposed_on ? ` ${thaiDate(a.disposed_on, "short")}` : ""),
      n2(a.acc_dep),
      n2(a.net_value),
    ]),
    footer: [`รวม ${rows.length} รายการ`, "", "", "", "", "", sum(rows.map((r) => r.price)), "", "", "", "", "", "",
      sum(rows.map((r) => r.acc_dep)), sum(rows.map((r) => r.net_value))],
  };
}

async function depreciationReport(s: AssetReportScope): Promise<ReportTable> {
  const rows = await fetchDepreciation(s.year, s.unit.id, s.sub);
  return {
    kind: "asset-depreciation",
    title: `${ASSET_REPORT_LABEL.depreciation} ${s.year}`,
    subtitle: `${scopeText(s)} · ${fy(s.year)}`,
    note: "เส้นตรงตามจำนวนวันจริง ค่าเสื่อมต่อวัน = (ราคา - 1) ÷ (อายุปี × 365) เหลือมูลค่าซาก 1 บาท ครุภัณฑ์ที่จำหน่ายระหว่างปีคิดถึงวันจำหน่าย",
    columns: [
      { header: "เลขครุภัณฑ์", width: 16 },
      { header: "ชื่อ", width: 28 },
      { header: "ประเภท", width: 18 },
      { header: "หน่วยที่ครอบครอง", width: 24 },
      { header: "วันที่ได้มา", width: 13 },
      money("ราคา"),
      num("อายุ (ปี)", 8),
      money("ค่าเสื่อมสะสมต้นปี"),
      money("ค่าเสื่อมประจำปี"),
      money("ค่าเสื่อมสะสมสิ้นปี"),
      money("มูลค่าสุทธิสิ้นปี"),
      { header: "หมายเหตุ", width: 18 },
    ],
    rows: rows.map((a) => [
      a.asset_no,
      a.name,
      a.type_name,
      a.unit_name,
      thaiDate(a.acquired_on, "short"),
      n2(a.price),
      a.life_years,
      n2(a.opening),
      n2(a.depreciation),
      n2(a.closing),
      n2(a.net_value),
      a.disposed_on ? `จำหน่าย ${thaiDate(a.disposed_on, "short")}` : "",
    ]),
    footer: [`รวม ${rows.length} รายการ`, "", "", "", "", sum(rows.map((r) => r.price)), "", sum(rows.map((r) => r.opening)),
      sum(rows.map((r) => r.depreciation)), sum(rows.map((r) => r.closing)), sum(rows.map((r) => r.net_value)), ""],
  };
}

function countReport(s: AssetReportScope, c: CountDetail | null): ReportTable {
  if (!c) {
    return {
      kind: "asset-count",
      title: ASSET_REPORT_LABEL.count,
      subtitle: scopeText(s),
      note: "ยังไม่มีรอบตรวจนับของหน่วยนี้ เปิดรอบได้ที่เมนู ตรวจนับ",
      columns: [{ header: "เลขครุภัณฑ์" }],
      rows: [],
    };
  }
  const t = countSummary(c.items);
  return {
    kind: "asset-count",
    title: `${ASSET_REPORT_LABEL.count}: ${c.title}`,
    subtitle: `${c.unit_name}${c.include_sub ? " (รวมหน่วยใต้สังกัด)" : ""} · เริ่ม ${thaiDate(c.started_on)}${c.closed_at ? ` · ปิดรอบ ${thaiDateTime(c.closed_at)}` : " · ยังไม่ปิดรอบ"}`,
    note: `ต้องตรวจ ${t.total} รายการ · พบ ${t.found} · ชำรุด ${t.damaged} · ไม่พบ ${t.missing}${t.unchecked ? ` · ยังไม่ตรวจ ${t.unchecked}` : ""} · ผลต่าง (ไม่พบ + พบชำรุดแต่ทะเบียนเป็นใช้งานได้) ${t.missing + t.changed} รายการ`,
    columns: [
      { header: "เลขครุภัณฑ์", width: 16 },
      { header: "ชื่อ", width: 28 },
      { header: "หน่วยที่ครอบครอง", width: 24 },
      { header: "สถานที่ตั้ง", width: 18 },
      { header: "สภาพในทะเบียน", width: 14 },
      { header: "ผลตรวจ", width: 10 },
      { header: "หมายเหตุ", width: 20 },
      { header: "วันเวลาที่ตรวจ", width: 20 },
      { header: "ผู้ตรวจ", width: 20 },
    ],
    rows: c.items.map((i) => [
      i.asset_no,
      i.name,
      i.unit_name,
      i.location,
      CONDITION_LABEL[i.expected_condition],
      i.result ? COUNT_RESULT_LABEL[i.result] : "ยังไม่ตรวจ",
      i.note,
      i.checked_at && i.result !== "missing" ? thaiDateTime(i.checked_at) : "",
      i.result !== "missing" ? (i.checked_by_name ?? "") : "",
    ]),
  };
}

async function issuesReport(s: AssetReportScope): Promise<ReportTable> {
  const rows = await fetchIssueReport(s.year, s.unit.id, s.sub);
  return {
    kind: "inventory-issues",
    title: `รายงาน${ASSET_REPORT_LABEL.issues} ${s.year}`,
    subtitle: `${scopeText(s)} · ${fy(s.year)}`,
    note: "รายการที่จ่ายของตามใบเบิกที่อนุมัติแล้ว (ตัดสต็อกแล้ว) ของคลังในขอบเขต",
    columns: [
      { header: "วันที่จ่าย", width: 13 },
      { header: "เลขที่ใบเบิก", width: 16 },
      { header: "คลัง", width: 22 },
      { header: "หน่วย", width: 24 },
      { header: "รหัสวัสดุ", width: 12 },
      { header: "วัสดุ", width: 26 },
      num("จำนวน", 10),
      { header: "หน่วยนับ", width: 10 },
      { header: "ผู้เบิก", width: 22 },
      { header: "วัตถุประสงค์", width: 28 },
    ],
    rows: rows.map((r) => [
      thaiDate(r.issued_on, "short"),
      r.request_no,
      r.warehouse_name,
      r.unit_name,
      r.item_code,
      r.item_name,
      n2(r.quantity),
      r.item_unit,
      r.requester_name ?? "",
      r.purpose,
    ]),
    footer: [`รวม ${rows.length} รายการ จาก ${new Set(rows.map((r) => r.request_no)).size} ใบเบิก`, "", "", "", "", "", "", "", "", ""],
  };
}

async function compareReport(s: AssetReportScope, linkOf: (unitId: string) => string): Promise<ReportTable> {
  const rows = await fetchUnitCompare(s.year, s.unit.id);
  const children = rows.filter((r) => !r.is_self);
  return {
    kind: "asset-compare",
    title: `${ASSET_REPORT_LABEL.compare} ${s.year}`,
    subtitle: `${s.unit.name} และหน่วยใต้สังกัดชั้นถัดไป · ${fy(s.year)} · ข้อมูล ณ สิ้นปี`,
    note: "แถวแรก = เฉพาะหน่วยนี้ แถวอื่นรวมทั้งสายของหน่วยนั้น ครุภัณฑ์นับตามหน่วยที่ครอบครองปัจจุบัน ใบเบิก = ใบเบิกที่จ่ายของแล้วในปี",
    columns: [
      { header: "หน่วย", width: 30 },
      num("จำนวนครุภัณฑ์"),
      money("มูลค่าทุน"),
      money("ค่าเสื่อมสะสม"),
      money("มูลค่าสุทธิ"),
      money("ค่าเสื่อมประจำปี"),
      num("ชำรุด", 8),
      num("รอจำหน่าย", 9),
      num("จำหน่ายในปี", 10),
      num("ใบเบิกที่จ่าย", 10),
    ],
    rows: rows.map((r) => [
      r.is_self ? `${r.unit_name} (หน่วยนี้)` : r.unit_name,
      r.asset_count,
      n2(r.cost),
      n2(r.acc_dep),
      n2(r.net_value),
      n2(r.year_dep),
      r.damaged,
      r.pending_disposal,
      r.disposed_in_year,
      r.requisitions_issued,
    ]),
    rowLinks: rows.map((r) => (!r.is_self && r.has_children ? linkOf(r.unit_id) : null)),
    footer: [
      "รวม",
      rows.reduce((t, r) => t + r.asset_count, 0),
      sum(rows.map((r) => r.cost)),
      sum(rows.map((r) => r.acc_dep)),
      sum(rows.map((r) => r.net_value)),
      sum(rows.map((r) => r.year_dep)),
      rows.reduce((t, r) => t + r.damaged, 0),
      rows.reduce((t, r) => t + r.pending_disposal, 0),
      rows.reduce((t, r) => t + r.disposed_in_year, 0),
      rows.reduce((t, r) => t + r.requisitions_issued, 0),
    ].map((v, i) => (i === 0 && children.length === 0 ? "รวม (ไม่มีหน่วยใต้สังกัด)" : v)),
  };
}

export async function buildAssetReport(kind: AssetReportKind, s: AssetReportScope, linkOf: (unitId: string) => string): Promise<ReportTable> {
  switch (kind) {
    case "depreciation":
      return depreciationReport(s);
    case "count":
      return countReport(s, s.countId ? await fetchCountDetail(s.countId) : null);
    case "issues":
      return issuesReport(s);
    case "compare":
      return compareReport(s, linkOf);
    default:
      return registerReport(s);
  }
}
