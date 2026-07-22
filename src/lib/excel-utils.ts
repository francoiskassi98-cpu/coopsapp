import ExcelJS from "exceljs";

export interface ProducerRow {
  cooperative: string;
  full_name: string;
  producer_number: string;
  national_id: string;
  producer_code: string;
  sexe: string;
  section: string;
  total_cocoa_area: number;
  num_plots: number;
  plantation_code: string;
  delivery_potential: number;
  plantation_area: number;
  latitude: number;
  longitude: number;
  num_men: number;
  num_women: number;
}

export interface ImportError {
  row: number;
  message: string;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-]/g, " ").replace(/\s+/g, " ");
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalise le sexe importé vers "Homme" ou "Femme".
 * Accepte : Homme, Femme, H, F, M, Masculin, Feminin, Féminin (insensible à la casse/accents).
 * Retourne null si vide ; "" (chaîne vide) si valeur non reconnue.
 */
export function normalizeSexe(raw: unknown): "Homme" | "Femme" | null | "" {
  if (raw === null || raw === undefined) return null;
  const s = stripAccents(String(raw).trim().toLowerCase());
  if (!s) return null;
  if (["h", "m", "homme", "hommes", "masculin", "male"].includes(s)) return "Homme";
  if (["f", "femme", "femmes", "feminin", "female"].includes(s)) return "Femme";
  return "";
}

// Exact template column headers
export const TEMPLATE_COLUMNS: { header: string; field: keyof ProducerRow }[] = [
  { header: "Registre", field: "cooperative" },
  { header: "Nom et prenom du producteur", field: "full_name" },
  { header: "Numero du producteur", field: "producer_number" },
  { header: "N° identification nationale du producteur", field: "national_id" },
  { header: "Code du producteur", field: "producer_code" },
  { header: "Sexe", field: "sexe" },
  { header: "Section", field: "section" },
  { header: "Superficie total cacao", field: "total_cocoa_area" },
  { header: "Nombre de champ de cacao", field: "num_plots" },
  { header: "Code de la plantation", field: "plantation_code" },
  { header: "Potentiel de livraison", field: "delivery_potential" },
  { header: "Superficie", field: "plantation_area" },
  { header: "Latitude polygone", field: "latitude" },
  { header: "Longitude polygone", field: "longitude" },
  { header: "Nombre d'hommes", field: "num_men" },
  { header: "Nombre de femmes", field: "num_women" },
];

const COLUMN_MAP: Record<string, keyof ProducerRow> = {};
for (const col of TEMPLATE_COLUMNS) {
  COLUMN_MAP[normalizeHeader(col.header)] = col.field;
}

function sheetToJson(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.text?.toString() || "";
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, any> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) obj[key] = cell.value;
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return rows;
}

export function parseExcelFile(data: ArrayBuffer): Promise<{ rows: ProducerRow[]; errors: ImportError[] }>;
export async function parseExcelFile(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { rows: [], errors: [{ row: 0, message: "Le fichier est vide." }] };
  }

  const rawRows = sheetToJson(sheet);

  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "Le fichier est vide." }] };
  }

  // Map headers
  const firstRowKeys = Object.keys(rawRows[0]);
  const headerMap: Record<string, keyof ProducerRow> = {};
  for (const key of firstRowKeys) {
    const normalized = normalizeHeader(key);
    if (COLUMN_MAP[normalized]) {
      headerMap[key] = COLUMN_MAP[normalized];
    }
  }

  const errors: ImportError[] = [];
  const rows: ProducerRow[] = [];
  const plantationCodes = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // Excel row (1-indexed + header)

    const row: Partial<ProducerRow> = {};
    for (const [excelKey, fieldKey] of Object.entries(headerMap)) {
      (row as any)[fieldKey] = raw[excelKey];
    }

    // Validate required fields
    if (!row.full_name) {
      errors.push({ row: rowNum, message: "Nom complet manquant" });
      continue;
    }
    if (!row.section) {
      errors.push({ row: rowNum, message: "Section manquante" });
      continue;
    }
    if (!row.plantation_code) {
      errors.push({ row: rowNum, message: "Code plantation manquant" });
      continue;
    }
    if (!row.delivery_potential && row.delivery_potential !== 0) {
      errors.push({ row: rowNum, message: "Potentiel de livraison manquant" });
      continue;
    }

    // Check plantation code uniqueness within file
    const code = String(row.plantation_code).trim();
    if (plantationCodes.has(code)) {
      errors.push({ row: rowNum, message: `Code plantation en doublon : ${code}` });
      continue;
    }
    plantationCodes.add(code);

    // Normalisation & validation du sexe
    const sexeNorm = normalizeSexe(row.sexe);
    if (sexeNorm === "") {
      errors.push({ row: rowNum, message: `Valeur Sexe invalide : "${row.sexe}". Utilisez Homme, Femme, H, F, Masculin ou Feminin.` });
      continue;
    }

    rows.push({
      cooperative: String(row.cooperative || "").trim(),
      full_name: String(row.full_name).trim(),
      producer_number: String(row.producer_number || "").trim(),
      national_id: String(row.national_id || "").trim(),
      producer_code: String(row.producer_code || "").trim(),
      sexe: sexeNorm ?? "",
      section: String(row.section).trim(),
      total_cocoa_area: Number(row.total_cocoa_area) || 0,
      num_plots: Number(row.num_plots) || 0,
      plantation_code: code,
      delivery_potential: Number(row.delivery_potential) || 0,
      plantation_area: Number(row.plantation_area) || 0,
      latitude: Number(row.latitude) || 0,
      longitude: Number(row.longitude) || 0,
      num_men: Number(row.num_men) || 0,
      num_women: Number(row.num_women) || 0,
    });
  }

  return { rows, errors };
}

export async function exportToExcel(
  data: Record<string, any>[],
  filename: string,
  sheetName = "Données"
) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    ws.columns = keys.map((key) => ({ header: key, key, width: Math.max(key.length + 2, 18) }));
    for (const row of data) {
      ws.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadImportTemplate() {
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Registre");

  ws.columns = headers.map((h) => ({ header: h, width: Math.max(h.length + 2, 18) }));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Knf-Modèle-COOPS APP.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
