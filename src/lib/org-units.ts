/** ชนิดข้อมูลและกติกาของเขตปกครอง ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const ORG_LEVELS = ["central", "region", "province", "district", "subdistrict"] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

export const SECTS = ["mahanikaya", "dhammayut"] as const;
export type Sect = (typeof SECTS)[number];

export const LEVEL_LABEL: Record<OrgLevel, string> = {
  central: "ส่วนกลาง",
  region: "ภาค",
  province: "จังหวัด",
  district: "อำเภอ",
  subdistrict: "ตำบล",
};

export const SECT_LABEL: Record<Sect, string> = {
  mahanikaya: "มหานิกาย",
  dhammayut: "ธรรมยุต",
};

export type OrgUnit = {
  id: string;
  parent_id: string | null;
  level: OrgLevel;
  sect: Sect | null;
  name: string;
  code: string;
  is_active: boolean;
};

export type OrgUnitNode = OrgUnit & { children: OrgUnitNode[] };

/** ระดับถัดลงไปหนึ่งชั้น (ตำบลไม่มีชั้นถัดไป) */
export function childLevelOf(level: OrgLevel): OrgLevel | null {
  const i = ORG_LEVELS.indexOf(level);
  return i >= 0 && i < ORG_LEVELS.length - 1 ? ORG_LEVELS[i + 1] : null;
}

/** ระดับถัดขึ้นไปหนึ่งชั้น (ส่วนกลางไม่มีหน่วยเหนือ) */
export function parentLevelOf(level: OrgLevel): OrgLevel | null {
  const i = ORG_LEVELS.indexOf(level);
  return i > 0 ? ORG_LEVELS[i - 1] : null;
}

export function buildTree(units: OrgUnit[]): OrgUnitNode[] {
  const byId = new Map<string, OrgUnitNode>();
  for (const u of units) byId.set(u.id, { ...u, children: [] });
  const roots: OrgUnitNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: OrgUnitNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// ------------------------------------------------------------------
// การนำเข้าจาก Excel
// ------------------------------------------------------------------

export const IMPORT_HEADERS = ["รหัสหน่วย", "ชื่อหน่วย", "ระดับ", "นิกาย", "รหัสหน่วยเหนือ"] as const;
export const IMPORT_MAX_ROWS = 5000;

export type ImportRawRow = {
  rowNumber: number;
  code: string;
  name: string;
  level: string;
  sect: string;
  parentCode: string;
};

export type ImportRow = {
  rowNumber: number;
  code: string;
  name: string;
  level: OrgLevel | null;
  sect: Sect | null;
  parentCode: string;
  levelText: string;
  sectText: string;
  status: "new" | "skip" | "error";
  message: string;
};

const LEVEL_BY_TEXT = new Map<string, OrgLevel>(
  ORG_LEVELS.flatMap((l) => [
    [LEVEL_LABEL[l], l],
    [l, l],
  ]),
);
const SECT_BY_TEXT = new Map<string, Sect>([
  ["มหานิกาย", "mahanikaya"],
  ["mahanikaya", "mahanikaya"],
  ["ธรรมยุต", "dhammayut"],
  ["ธรรมยุติกนิกาย", "dhammayut"],
  ["dhammayut", "dhammayut"],
]);

/** ตรวจแถวที่อ่านจาก Excel เทียบกับหน่วยที่มีอยู่ในระบบ */
export function validateImportRows(raw: ImportRawRow[], existing: OrgUnit[]): ImportRow[] {
  const existingByCode = new Map(existing.map((u) => [u.code, u]));
  const seen = new Map<string, number>();
  const rows: ImportRow[] = raw.map((r) => {
    const code = r.code.trim();
    const name = r.name.trim();
    const levelText = r.level.trim();
    const sectText = r.sect.trim();
    const parentCode = r.parentCode.trim();
    const level = LEVEL_BY_TEXT.get(levelText.toLowerCase()) ?? null;
    const sect = SECT_BY_TEXT.get(sectText.toLowerCase()) ?? null;
    const errors: string[] = [];

    if (!code) errors.push("ไม่มีรหัสหน่วย");
    if (!name) errors.push("ไม่มีชื่อหน่วย");
    if (!level) errors.push(levelText ? `ไม่รู้จักระดับ "${levelText}"` : "ไม่มีระดับ");
    if (level && level !== "central") {
      if (!sect) errors.push(sectText ? `ไม่รู้จักนิกาย "${sectText}"` : "ไม่มีนิกาย");
      if (!parentCode) errors.push("ไม่มีรหัสหน่วยเหนือ");
    }
    if (level === "central" && parentCode) errors.push("ส่วนกลางต้องไม่มีรหัสหน่วยเหนือ");
    if (code) {
      const first = seen.get(code);
      if (first !== undefined) errors.push(`รหัสซ้ำกับแถวที่ ${first}`);
      else seen.set(code, r.rowNumber);
    }

    return {
      rowNumber: r.rowNumber,
      code,
      name,
      level,
      sect: level === "central" ? null : sect,
      parentCode,
      levelText,
      sectText,
      status: errors.length ? "error" : "new",
      message: errors.join(" / "),
    };
  });

  // ตรวจหน่วยเหนือ: ต้องมีในระบบหรืออยู่ในไฟล์เดียวกัน (และแถวนั้นต้องไม่ผิด)
  const byCode = new Map(rows.filter((r) => r.code).map((r) => [r.code, r]));
  const levelOrder = (l: OrgLevel) => ORG_LEVELS.indexOf(l);
  const ordered = [...rows].sort(
    (a, b) => (a.level ? levelOrder(a.level) : 99) - (b.level ? levelOrder(b.level) : 99),
  );

  for (const row of ordered) {
    if (row.status === "error") continue;

    if (existingByCode.has(row.code)) {
      row.status = "skip";
      row.message = "มีรหัสนี้ในระบบแล้ว (ข้าม)";
      continue;
    }
    if (row.level === "central") continue;

    const parentInDb = existingByCode.get(row.parentCode);
    const parentInFile = byCode.get(row.parentCode);
    const parent = parentInDb
      ? { level: parentInDb.level, sect: parentInDb.sect, ok: parentInDb.is_active, why: "หน่วยเหนือถูกปิดใช้งานอยู่" }
      : parentInFile
        ? { level: parentInFile.level, sect: parentInFile.sect, ok: parentInFile.status !== "error", why: "แถวของหน่วยเหนือมีข้อผิดพลาด" }
        : null;

    if (!parent) {
      row.status = "error";
      row.message = `ไม่พบรหัสหน่วยเหนือ "${row.parentCode}"`;
    } else if (!parent.ok) {
      row.status = "error";
      row.message = parent.why;
    } else if (parent.level !== parentLevelOf(row.level!)) {
      row.status = "error";
      row.message = `${LEVEL_LABEL[row.level!]}ต้องอยู่ใต้${LEVEL_LABEL[parentLevelOf(row.level!)!]}`;
    } else if (parent.sect && parent.sect !== row.sect) {
      row.status = "error";
      row.message = "นิกายไม่ตรงกับหน่วยเหนือ";
    }
  }

  return rows;
}
