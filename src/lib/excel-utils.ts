import ExcelJS from "exceljs";
import { currentCampaign, normalizeCampaign } from "@/lib/campaign";

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
  campaign_label: string;
}

export type ImportSeverity = "error" | "warning";

export interface ImportError {
  row: number;
  column?: string;
  value?: string;
  cause: string;
  expected?: string;
  action?: string;
  severity: ImportSeverity;
  /** backward-compat message combining cause + action */
  message: string;
}

export interface ImportReport {
  rows: ProducerRow[];
  errors: ImportError[];
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  warnings: number;
  blockingErrors: number;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalise le sexe importé vers "Homme" ou "Femme".
 */
export function normalizeSexe(raw: unknown): "Homme" | "Femme" | null | "" {
  if (raw === null || raw === undefined) return null;
  const s = stripAccents(String(raw).trim().toLowerCase());
  if (!s) return null;
  if (["h", "m", "homme", "hommes", "masculin", "male"].includes(s)) return "Homme";
  if (["f", "femme", "femmes", "feminin", "female"].includes(s)) return "Femme";
  return "";
}

/**
 * Vérifie qu'une campagne suit le format "YYYY-YYYY" avec années consécutives.
 */
function validateCampaign(raw: unknown): { ok: boolean; value: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, value: currentCampaign() };
  }
  const normalized = normalizeCampaign(String(raw));
  const m = normalized.match(/^(\d{4})-(\d{4})$/);
  if (!m) return { ok: false, value: normalized };
  const y1 = parseInt(m[1], 10);
  const y2 = parseInt(m[2], 10);
  if (y2 !== y1 + 1) return { ok: false, value: normalized };
  return { ok: true, value: normalized };
}

// Colonnes du modèle Excel (import ↔ export STRICTEMENT identiques)
export const TEMPLATE_COLUMNS: { header: string; field: keyof ProducerRow }[] = [
  { header: "Registre", field: "cooperative" },
  { header: "Campagne", field: "campaign_label" },
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
];

const COLUMN_MAP: Record<string, { field: keyof ProducerRow; header: string }> = {};
for (const col of TEMPLATE_COLUMNS) {
  COLUMN_MAP[normalizeHeader(col.header)] = { field: col.field, header: col.header };
}

/** Ligne brute lue depuis Excel : en-tête → valeur de cellule. */
type RawExcelRow = Record<string, ExcelJS.CellValue>;

function sheetToJson(worksheet: ExcelJS.Worksheet): RawExcelRow[] {
  const rows: RawExcelRow[] = [];
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.text?.toString() || "";
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: RawExcelRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) obj[key] = cell.value;
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return rows;
}


function makeError(
  row: number,
  column: string,
  value: unknown,
  cause: string,
  expected: string,
  action: string,
  severity: ImportSeverity = "error"
): ImportError {
  const val = value === null || value === undefined ? "" : String(value);
  return {
    row,
    column,
    value: val,
    cause,
    expected,
    action,
    severity,
    message: `[${column}] ${cause}. Attendu : ${expected}. ${action}`,
  };
}

function isFiniteNumber(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n);
}

export async function parseExcelFile(data: ArrayBuffer): Promise<ImportReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      rows: [], errors: [makeError(0, "—", "", "Fichier vide", "Feuille de calcul avec données", "Vérifiez le contenu du fichier Excel.")],
      totalRows: 0, validRows: 0, rejectedRows: 0, warnings: 0, blockingErrors: 1,
    };
  }

  const rawRows = sheetToJson(sheet);
  if (rawRows.length === 0) {
    return {
      rows: [], errors: [makeError(0, "—", "", "Fichier vide", "Au moins une ligne de données", "Ajoutez des lignes de producteurs.")],
      totalRows: 0, validRows: 0, rejectedRows: 0, warnings: 0, blockingErrors: 1,
    };
  }

  // Map headers
  const firstRowKeys = Object.keys(rawRows[0]);
  const headerMap: Record<string, { field: keyof ProducerRow; header: string }> = {};
  for (const key of firstRowKeys) {
    const normalized = normalizeHeader(key);
    if (COLUMN_MAP[normalized]) headerMap[key] = COLUMN_MAP[normalized];
  }

  const errors: ImportError[] = [];
  const rows: ProducerRow[] = [];
  const plantationCodes = new Map<string, number>(); // code -> first row seen
  let rejectedRows = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // Excel row (1-indexed + header)

    const row: Partial<Record<keyof ProducerRow, ExcelJS.CellValue>> = {};
    for (const [excelKey, def] of Object.entries(headerMap)) {
      row[def.field] = raw[excelKey];
    }


    const rowErrors: ImportError[] = [];

    // Champs obligatoires
    if (!row.full_name || String(row.full_name).trim() === "") {
      rowErrors.push(makeError(rowNum, "Nom et prenom du producteur", row.full_name, "Champ obligatoire vide", "Nom et prénom du producteur", "Renseignez le nom complet."));
    }
    if (!row.section || String(row.section).trim() === "") {
      rowErrors.push(makeError(rowNum, "Section", row.section, "Champ obligatoire vide", "Nom de la section", "Renseignez la section."));
    }
    if (!row.plantation_code || String(row.plantation_code).trim() === "") {
      rowErrors.push(makeError(rowNum, "Code de la plantation", row.plantation_code, "Champ obligatoire vide", "Code unique de plantation", "Renseignez un code de plantation unique."));
    }
    if (!row.cooperative || String(row.cooperative).trim() === "") {
      rowErrors.push(makeError(rowNum, "Registre", row.cooperative, "Champ obligatoire vide", "Nom du registre", "Renseignez le registre."));
    }

    // Potentiel
    if (row.delivery_potential === null || row.delivery_potential === undefined || String(row.delivery_potential) === "") {
      rowErrors.push(makeError(rowNum, "Potentiel de livraison", row.delivery_potential, "Champ obligatoire vide", "Nombre en kg (>= 0)", "Renseignez un potentiel de livraison."));
    } else if (!isFiniteNumber(row.delivery_potential) || Number(row.delivery_potential) < 0) {
      rowErrors.push(makeError(rowNum, "Potentiel de livraison", row.delivery_potential, "Valeur numérique invalide", "Nombre positif en kg", "Utilisez un nombre décimal (ex : 1500)."));
    }

    // Numériques optionnels
    for (const [field, header] of [
      ["total_cocoa_area", "Superficie total cacao"],
      ["num_plots", "Nombre de champ de cacao"],
      ["plantation_area", "Superficie"],
      ["latitude", "Latitude polygone"],
      ["longitude", "Longitude polygone"],
    ] as const) {
      const v = row[field];
      if (v !== null && v !== undefined && String(v).trim() !== "" && !isFiniteNumber(v)) {
        rowErrors.push(makeError(rowNum, header, v, "Valeur non numérique", "Nombre décimal", "Utilisez un nombre (ex : 12.5). Laissez vide si inconnu."));
      }
    }

    // Doublon dans le fichier
    if (row.plantation_code) {
      const code = String(row.plantation_code).trim();
      if (plantationCodes.has(code)) {
        rowErrors.push(makeError(rowNum, "Code de la plantation", code, `Doublon avec la ligne ${plantationCodes.get(code)}`, "Code unique de plantation", "Attribuez un code unique à chaque plantation."));
      } else {
        plantationCodes.set(code, rowNum);
      }
    }

    // Sexe
    const sexeNorm = normalizeSexe(row.sexe);
    if (sexeNorm === "") {
      rowErrors.push(makeError(rowNum, "Sexe", row.sexe, "Valeur non reconnue", "Homme ou Femme", "Corriger l'orthographe (accepté : Homme, Femme, H, F, Masculin, Feminin)."));
    }

    // Campagne
    const campaign = validateCampaign(row.campaign_label);
    if (!campaign.ok) {
      rowErrors.push(makeError(rowNum, "Campagne", row.campaign_label, "Format de campagne invalide", `YYYY-YYYY (ex : ${currentCampaign()})`, "Utilisez le format AAAA-AAAA avec deux années consécutives, ou laissez vide pour la campagne en cours."));
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      rejectedRows++;
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
      plantation_code: String(row.plantation_code).trim(),
      delivery_potential: Number(row.delivery_potential) || 0,
      plantation_area: Number(row.plantation_area) || 0,
      latitude: Number(row.latitude) || 0,
      longitude: Number(row.longitude) || 0,
      campaign_label: campaign.value,
    });
  }

  const warnings = errors.filter((e) => e.severity === "warning").length;
  const blockingErrors = errors.filter((e) => e.severity === "error").length;

  return {
    rows,
    errors,
    totalRows: rawRows.length,
    validRows: rows.length,
    rejectedRows,
    warnings,
    blockingErrors,
  };
}

export async function exportToExcel<T extends object>(
  data: T[],

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
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Registre");

  ws.columns = TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.field,
    width: Math.max(c.header.length + 2, 20),
  }));

  // Style d'en-tête
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 30;

  // Ligne exemple avec campagne courante préremplie
  const example: Record<string, string | number> = {
    cooperative: "COOP-EXEMPLE",
    campaign_label: currentCampaign(),
    full_name: "KOUAME KOFFI",
    producer_number: "001",
    national_id: "",
    producer_code: "P-001",
    sexe: "Homme",
    section: "Section A",
    total_cocoa_area: 3.5,
    num_plots: 2,
    plantation_code: "PL-0001",
    delivery_potential: 1500,
    plantation_area: 2.5,
    latitude: 0,
    longitude: 0,
  };
  ws.addRow(example);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Knf-Modèle-COOPS APP.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Génère et télécharge un rapport Excel des erreurs d'importation.
 */
export async function downloadErrorReport(errors: ImportError[], filename = "Rapport-erreurs-import.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Erreurs");

  ws.columns = [
    { header: "Ligne", key: "row", width: 8 },
    { header: "Sévérité", key: "severity", width: 12 },
    { header: "Colonne", key: "column", width: 32 },
    { header: "Valeur trouvée", key: "value", width: 24 },
    { header: "Cause", key: "cause", width: 40 },
    { header: "Valeur attendue", key: "expected", width: 32 },
    { header: "Action recommandée", key: "action", width: 50 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  for (const e of errors) {
    const r = ws.addRow({
      row: e.row,
      severity: e.severity === "warning" ? "Avertissement" : "Erreur",
      column: e.column || "",
      value: e.value || "",
      cause: e.cause,
      expected: e.expected || "",
      action: e.action || "",
    });
    r.alignment = { vertical: "top", wrapText: true };
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
