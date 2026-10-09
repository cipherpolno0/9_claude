import "server-only";

import ExcelJS from "exceljs";

import {
  DATA_FIRST_ROW,
  DATA_ROW_COUNT,
  columnLetter,
  columnRuleText,
  type FormColumn,
  type FormTemplate,
  type HeaderField,
} from "@/lib/exam-forms";

/**
 * สร้างแม่แบบ Excel ของบัญชี ศ. จาก form_templates (หน้าดาวน์โหลดสาธารณะ และหน้าสมัครสอบใช้ตัวนี้ตัวเดียว)
 * แผ่นงานแรก = แบบตามไฟล์จริง (แถว 1 รหัสแฟ้มสีขาว, แถว 2 ข้อความเตือน, แถว 3 ชื่อบัญชี, แถว 4-5 หัวแฟ้ม,
 *   แถว 7-8 หัวตาราง, กรอกข้อมูลตั้งแต่แถว 9) มีกฎตรวจและคำแนะนำทุกคอลัมน์ ตรึงและป้องกันแถวหัว ช่องข้อมูลกรอกได้
 * แผ่นงาน "ตัวอย่าง" = แถวตัวอย่าง 1 แถว (ข้อมูลสมมุติ) และคำแนะนำรายคอลัมน์
 * แผ่นงาน "รายการ" (ซ่อน) = รายการคำนำหน้าชื่อของประเภทการสอบนั้น
 */

export type HeaderValues = Partial<Record<HeaderField, string | number | null>>;

const LABEL_FONT = "BrowalliaUPC";
const RED = "FFFF0000";
const THIN: Partial<ExcelJS.Border> = { style: "thin" };
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const NO_FORMULA_TITLE = "ห้ามใช้สูตร";
const EXAMPLE_SHEET = "ตัวอย่าง";
const LIST_SHEET = "รายการ";

/** ExcelJS มีตัวเพิ่มกฎตรวจแบบช่วงเซลล์ แต่ไฟล์ชนิดข้อมูลของแพ็กเกจยังไม่ประกาศไว้ */
type RangeValidations = { dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void } };

const clip = (text: string | undefined, max: number) => (text ?? "").slice(0, max);

function rowOf(cell: string) {
  return Number(cell.replace(/^[A-Z]+/, ""));
}

function applyCells(sheet: ExcelJS.Worksheet, range: string, fn: (cell: ExcelJS.Cell) => void) {
  const [from, to = from] = range.split(":");
  const startCol = sheet.getCell(from).col;
  const endCol = sheet.getCell(to).col;
  const startRow = rowOf(from);
  const endRow = rowOf(to);
  for (let r = startRow; r <= endRow; r++) {
    for (let c = Number(startCol); c <= Number(endCol); c++) fn(sheet.getCell(r, c));
  }
}

/** คอลัมน์หัวตาราง 2 บรรทัด: รวมแนวนอนตาม top_span และรวมแนวตั้งเมื่อมีแต่บรรทัดบน */
function writeColumnHeaders(sheet: ExcelJS.Worksheet, columns: FormColumn[], topRow: number, bottomRed: boolean) {
  const bottomRow = topRow + 1;
  let coveredUntil = 0;
  columns.forEach((col, i) => {
    const n = i + 1;
    const letter = columnLetter(n);
    const top = sheet.getCell(topRow, n);
    const bottom = sheet.getCell(bottomRow, n);
    for (const [cell, red] of [
      [top, true],
      [bottom, bottomRed],
    ] as const) {
      cell.font = { name: LABEL_FONT, size: 14, color: red ? { argb: RED } : undefined };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = BOX;
      cell.protection = { locked: true };
    }
    if (n > coveredUntil && col.top) top.value = col.top;
    if (col.bottom) bottom.value = col.bottom;
    if (n > coveredUntil && col.top_span > 1) {
      sheet.mergeCells(`${letter}${topRow}:${columnLetter(n + col.top_span - 1)}${topRow}`);
      coveredUntil = n + col.top_span - 1;
    } else if (n > coveredUntil && col.top && !col.bottom) {
      sheet.mergeCells(`${letter}${topRow}:${letter}${bottomRow}`);
    }
  });
}

function dataValidation(col: FormColumn, letter: string, titleRange: string | null): ExcelJS.DataValidation {
  const prompt = {
    showInputMessage: Boolean(col.help || col.help_title),
    promptTitle: clip(col.help_title, 32),
    prompt: clip(col.help, 255),
  };
  const noFormula: ExcelJS.DataValidation = {
    type: "custom",
    allowBlank: true,
    formulae: [`LEFT(TRIM(${letter}${DATA_FIRST_ROW}),1)<>"="`],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: NO_FORMULA_TITLE,
    error: NO_FORMULA_TITLE,
    ...prompt,
  };
  switch (col.type) {
    case "number":
    case "year":
      return {
        type: "whole",
        operator: "between",
        allowBlank: true,
        formulae: [col.min ?? 0, col.max ?? 0],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: clip(col.error_title || "ข้อมูลไม่ถูกต้อง", 32),
        error: clip(col.error || `ใส่ตัวเลข ${col.min ?? 0} ถึง ${col.max ?? 0} เป็นเลขอารบิก`, 255),
        ...prompt,
      };
    case "list": {
      const options = col.options ?? [];
      const inline = `"${options.join(",")}"`;
      return {
        type: "list",
        allowBlank: true,
        formulae: [inline],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: clip(col.error_title || "ข้อมูลไม่ถูกต้อง", 32),
        error: clip(col.error || `เลือกได้เฉพาะ ${options.join(" ")}`, 255),
        ...prompt,
      };
    }
    case "title":
      if (!titleRange) return noFormula;
      // รายการคำนำหน้าอาจไม่ครบทุกยศ จึงเตือนแต่ยังยอมให้พิมพ์คำนำหน้าเต็มเองได้
      return {
        type: "list",
        allowBlank: true,
        formulae: [titleRange],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "คำนำหน้าไม่อยู่ในรายการ",
        error: "คำนำหน้านี้ไม่อยู่ในรายการ ตรวจว่าเป็นคำนำหน้าเต็มที่ถูกต้อง ถ้าถูกต้องกด ใช่ เพื่อใช้ต่อ",
        ...prompt,
      };
    default:
      return noFormula;
  }
}

function headerValue(field: HeaderField, raw: string | number | null | undefined, min?: number, max?: number) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (field === "year_be" || field === "region_no" || field === "venue_code") {
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return null;
    return n;
  }
  return String(raw);
}

function writeMainSheet(
  workbook: ExcelJS.Workbook,
  t: FormTemplate,
  titleRange: string | null,
  values: HeaderValues,
) {
  const last = columnLetter(t.columns.length);
  const sheet = workbook.addWorksheet(t.sheet_name, {
    views: [{ state: "frozen", ySplit: DATA_FIRST_ROW - 1, activeCell: `A${DATA_FIRST_ROW}` }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${DATA_FIRST_ROW - 2}:${DATA_FIRST_ROW - 1}`,
    },
  });

  // คอลัมน์ข้อมูลทั้งคอลัมน์กรอกได้ (ปลดล็อก) ส่วนแถวหัวล็อกไว้ทีละช่องด้านล่าง
  t.columns.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = col.width;
    column.protection = { locked: false };
    column.font = { name: "CordiaUPC", size: 14 };
  });

  const heights = t.layout.row_heights ?? {};
  for (let r = 1; r <= DATA_FIRST_ROW - 1; r++) {
    const h = heights[String(r)];
    if (h) sheet.getRow(r).height = h;
    for (let c = 1; c <= t.columns.length; c++) sheet.getCell(r, c).protection = { locked: true };
  }

  // แถว 1: รหัสแฟ้มของไฟล์จริง (ตัวอักษรสีขาว) คงไว้ตามต้นฉบับ
  const markerFont = { name: t.layout.marker_font ?? LABEL_FONT, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").value = t.marker_code || null;
  sheet.getCell("B1").value = t.marker_no ?? null;
  sheet.getCell("D1").value = t.version || null;
  for (const a of ["A1", "B1", "D1"]) sheet.getCell(a).font = markerFont;

  sheet.mergeCells(`A2:${last}2`);
  const notice = sheet.getCell("A2");
  notice.value = t.notice || null;
  notice.font = { name: LABEL_FONT, size: 28, color: { argb: RED } };
  notice.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  sheet.mergeCells(`A3:${last}3`);
  const title = sheet.getCell("A3");
  title.value = t.title;
  title.font = { name: LABEL_FONT, size: t.layout.title_size ?? 20, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };

  const valueFont = t.layout.value_font ?? {};
  for (const h of t.header_cells) {
    if (h.merge) sheet.mergeCells(h.merge);
    const cell = sheet.getCell(h.cell);
    if (h.field) {
      cell.value = headerValue(h.field, values[h.field], h.min, h.max);
      applyCells(sheet, h.merge ?? h.cell, (c) => {
        c.protection = { locked: false };
        c.border = BOX;
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.layout.value_fill ?? "FFFFFF99" } };
        c.font = {
          name: valueFont.name ?? "Cordia New",
          size: valueFont.size ?? 16,
          color: valueFont.color ? { argb: valueFont.color } : undefined,
        };
        c.alignment = { horizontal: "center", vertical: "middle" };
      });
      if (h.min !== undefined && h.max !== undefined) {
        cell.dataValidation = {
          type: "whole",
          operator: "between",
          allowBlank: true,
          formulae: [h.min, h.max],
          showInputMessage: Boolean(h.help),
          promptTitle: clip(h.help_title, 32),
          prompt: clip(h.help, 255),
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "ข้อมูลไม่ถูกต้อง",
          error: clip(h.error || `ใส่ตัวเลข ${h.min} ถึง ${h.max} เป็นเลขอารบิก`, 255),
        };
      } else if (h.help) {
        cell.dataValidation = {
          type: "custom",
          allowBlank: true,
          formulae: ["TRUE"],
          showInputMessage: true,
          promptTitle: clip(h.help_title, 32),
          prompt: clip(h.help, 255),
        };
      }
    } else {
      cell.value = h.text ?? null;
      cell.font = { name: LABEL_FONT, size: 18, bold: true, color: { argb: RED } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  writeColumnHeaders(sheet, t.columns, DATA_FIRST_ROW - 2, Boolean(t.layout.header_bottom_red));

  const lastRow = DATA_FIRST_ROW + DATA_ROW_COUNT - 1;
  t.columns.forEach((col, i) => {
    const letter = columnLetter(i + 1);
    (sheet as unknown as RangeValidations).dataValidations.add(`${letter}${DATA_FIRST_ROW}:${letter}${lastRow}`, dataValidation(col, letter, titleRange));
    if (col.header_help) {
      sheet.getCell(DATA_FIRST_ROW - 2, i + 1).dataValidation = {
        type: "custom",
        allowBlank: true,
        formulae: ["TRUE"],
        showInputMessage: true,
        promptTitle: clip(col.header_help_title, 32),
        prompt: clip(col.header_help, 255),
      };
    }
  });

  return sheet;
}

function writeExampleSheet(workbook: ExcelJS.Workbook, t: FormTemplate, titles: string[]) {
  const sheet = workbook.addWorksheet(EXAMPLE_SHEET, { views: [{ state: "frozen", ySplit: 4 }] });
  const last = columnLetter(t.columns.length);
  t.columns.forEach((col, i) => (sheet.getColumn(i + 1).width = col.width));

  sheet.mergeCells(`A1:${last}1`);
  const head = sheet.getCell("A1");
  head.value = `ตัวอย่างการกรอก ${t.title.replace(/\s+/g, " ")} (ข้อมูลสมมุติ ห้ามส่งแผ่นงานนี้) กรอกข้อมูลจริงในแผ่นงาน "${t.sheet_name}"`;
  head.font = { name: LABEL_FONT, size: 16, bold: true, color: { argb: RED } };
  head.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(1).height = 42;

  writeColumnHeaders(sheet, t.columns, 3, Boolean(t.layout.header_bottom_red));
  t.columns.forEach((col, i) => {
    const cell = sheet.getCell(5, i + 1);
    const example = col.example ?? "";
    cell.value = (col.type === "number" || col.type === "year") && /^\d+$/.test(example) ? Number(example) : example || null;
    cell.font = { name: "CordiaUPC", size: 14, color: { argb: "FF1F4E79" } };
    cell.border = BOX;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FB" } };
  });

  const guideRow = 8;
  sheet.mergeCells(`A${guideRow}:${last}${guideRow}`);
  const guideHead = sheet.getCell(`A${guideRow}`);
  guideHead.value = "คำแนะนำรายคอลัมน์ (ชี้ที่ช่องในแผ่นงานแรกเพื่อดูคำแนะนำเดียวกัน)";
  guideHead.font = { name: LABEL_FONT, size: 16, bold: true };

  const headers = ["คอลัมน์", "ชื่อคอลัมน์", "บังคับกรอก", "ชนิดและกฎตรวจ", "คำแนะนำ"];
  const spans = [1, 3, 1, 4, Math.max(1, t.columns.length - 9)];
  const writeRow = (r: number, values: string[], bold: boolean) => {
    let c = 1;
    values.forEach((v, i) => {
      const end = Math.min(t.columns.length, c + spans[i] - 1);
      if (end > c) sheet.mergeCells(r, c, r, end);
      const cell = sheet.getCell(r, c);
      cell.value = v;
      cell.font = { name: "CordiaUPC", size: 14, bold };
      cell.alignment = { vertical: "top", wrapText: true };
      for (let k = c; k <= end; k++) sheet.getCell(r, k).border = BOX;
      c = end + 1;
    });
  };
  writeRow(guideRow + 1, headers, true);
  t.columns.forEach((col, i) => {
    const help = [col.help, col.header_help].filter(Boolean).join(" / ");
    writeRow(
      guideRow + 2 + i,
      [columnLetter(i + 1), col.label, col.required ? "บังคับ" : "ไม่บังคับ", columnRuleText(col, titles), help],
      false,
    );
  });
  return sheet;
}

export async function buildTemplateWorkbook(
  template: FormTemplate,
  titleOptions: string[],
  values: HeaderValues = {},
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "กองบริหารทะเบียนและวัดผล";
  workbook.created = new Date();

  const usesTitles = template.columns.some((c) => c.type === "title") && titleOptions.length > 0;
  const titleRange = usesTitles ? `'${LIST_SHEET}'!$A$1:$A$${titleOptions.length}` : null;

  const main = writeMainSheet(workbook, template, titleRange, values);
  const example = writeExampleSheet(workbook, template, titleOptions);

  if (usesTitles) {
    const list = workbook.addWorksheet(LIST_SHEET, { state: "hidden" });
    titleOptions.forEach((name, i) => (list.getCell(i + 1, 1).value = name));
  }

  // ป้องกันแถวหัว (ไม่มีรหัสผ่าน) ช่องข้อมูลยังกรอก วาง แทรกแถว และลบแถวข้อมูลได้
  await main.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  });
  await example.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });
  workbook.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return workbook;
}
