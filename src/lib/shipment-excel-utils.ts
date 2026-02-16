import * as XLSX from "xlsx";

export interface ShipmentImportRow {
  connaissement: string;
  projet: string;
  partenaire: string;
  zone: string;
  destination: string;
  nom_producteur: string;
  code_plantation: string;
  section: string;
  poids_net: number;
  nombre_sacs: number;
  date_livraison: string;
  numero_recu: string;
}

export interface ShipmentImportError {
  row: number;
  message: string;
}

export interface MatchedProducer {
  code_plantation: string;
  db_full_name: string;
  db_section: string;
  db_cooperative: string;
  db_remaining_potential: number;
  file_nom_producteur: string;
  matched: boolean;
}

export const SHIPMENT_TEMPLATE_COLUMNS: { header: string; field: keyof ShipmentImportRow }[] = [
  { header: "Connaissement", field: "connaissement" },
  { header: "Projet", field: "projet" },
  { header: "Partenaire", field: "partenaire" },
  { header: "Zone", field: "zone" },
  { header: "Destination", field: "destination" },
  { header: "Nom du producteur", field: "nom_producteur" },
  { header: "Code plantation", field: "code_plantation" },
  { header: "Section", field: "section" },
  { header: "Poids net (kg)", field: "poids_net" },
  { header: "Nombre de sacs", field: "nombre_sacs" },
  { header: "Date de livraison", field: "date_livraison" },
  { header: "N° Reçu", field: "numero_recu" },
];

/** Detect campaign from a delivery date (Oct 1 - Sep 30 cycle) */
export function detectCampaignFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 10) {
    return `${year}–${year + 1}`;
  }
  return `${year - 1}–${year}`;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-°]/g, " ")
    .replace(/\s+/g, " ");
}

const SHIPMENT_COLUMN_MAP: Record<string, keyof ShipmentImportRow> = {};
for (const col of SHIPMENT_TEMPLATE_COLUMNS) {
  SHIPMENT_COLUMN_MAP[normalizeHeader(col.header)] = col.field;
}
// Add aliases for flexible matching
SHIPMENT_COLUMN_MAP["poids net"] = "poids_net";
SHIPMENT_COLUMN_MAP["poids net kg"] = "poids_net";
SHIPMENT_COLUMN_MAP["poids (kg)"] = "poids_net";
SHIPMENT_COLUMN_MAP["nombre de sacs"] = "nombre_sacs";
SHIPMENT_COLUMN_MAP["nb sacs"] = "nombre_sacs";
SHIPMENT_COLUMN_MAP["sacs"] = "nombre_sacs";
SHIPMENT_COLUMN_MAP["n recu"] = "numero_recu";
SHIPMENT_COLUMN_MAP["numero recu"] = "numero_recu";

function parseExcelDate(value: any): string {
  if (!value) return "";
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return str;
}

export function parseShipmentExcel(data: ArrayBuffer): { rows: ShipmentImportRow[]; errors: ShipmentImportError[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "Le fichier est vide." }] };
  }

  const firstRowKeys = Object.keys(rawRows[0]);
  const headerMap: Record<string, keyof ShipmentImportRow> = {};
  for (const key of firstRowKeys) {
    const normalized = normalizeHeader(key);
    // Exact match
    if (SHIPMENT_COLUMN_MAP[normalized]) {
      headerMap[key] = SHIPMENT_COLUMN_MAP[normalized];
      continue;
    }
    // Starts-with match
    for (const [mapKey, field] of Object.entries(SHIPMENT_COLUMN_MAP)) {
      if (normalized.startsWith(mapKey) || mapKey.startsWith(normalized)) {
        headerMap[key] = field;
        break;
      }
    }
  }

  const VALID_DESTINATIONS = ["Abidjan", "San-Pedro"];
  const VALID_PROJECTS = ["Fairtrade", "Rainforest Alliance", "Ordinaire"];

  function matchOrDefault<T extends string>(value: string, validList: T[], defaultVal: T): T {
    if (!value) return defaultVal;
    const lower = value.toLowerCase().trim();
    const found = validList.find((v) => v.toLowerCase() === lower);
    return found || defaultVal;
  }

  const errors: ShipmentImportError[] = [];
  const rows: ShipmentImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2;

    const row: Partial<ShipmentImportRow> = {};
    for (const [excelKey, fieldKey] of Object.entries(headerMap)) {
      (row as any)[fieldKey] = raw[excelKey];
    }

    if (!row.nom_producteur) {
      errors.push({ row: rowNum, message: "Nom du producteur manquant" });
      continue;
    }
    if (!row.code_plantation) {
      errors.push({ row: rowNum, message: "Code plantation manquant" });
      continue;
    }
    if (!row.poids_net && row.poids_net !== 0) {
      errors.push({ row: rowNum, message: "Poids net manquant" });
      continue;
    }
    if (!row.numero_recu) {
      errors.push({ row: rowNum, message: "N° Reçu manquant" });
      continue;
    }

    const rawDestination = String(row.destination || "").trim();
    const rawProjet = String(row.projet || "").trim();

    rows.push({
      connaissement: String(row.connaissement || "").trim(),
      projet: matchOrDefault(rawProjet, VALID_PROJECTS, "Ordinaire"),
      partenaire: String(row.partenaire || "").trim(),
      zone: String(row.zone || "").trim(),
      destination: matchOrDefault(rawDestination, VALID_DESTINATIONS, "Abidjan"),
      nom_producteur: String(row.nom_producteur).trim(),
      code_plantation: String(row.code_plantation).trim(),
      section: String(row.section || "").trim(),
      poids_net: Number(row.poids_net) || 0,
      nombre_sacs: Number(row.nombre_sacs) || 0,
      date_livraison: parseExcelDate(row.date_livraison),
      numero_recu: String(row.numero_recu).trim(),
    });
  }

  return { rows, errors };
}

export function downloadShipmentTemplate() {
  const headers = SHIPMENT_TEMPLATE_COLUMNS.map((c) => c.header);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Chargements");
  XLSX.writeFile(wb, "Knf-Modèle-Import-Chargements.xlsx");
}

/** Group rows by shipment (using connaissement + projet + destination as key) */
export function groupByShipment(rows: ShipmentImportRow[]) {
  const groups: Record<string, ShipmentImportRow[]> = {};
  for (const row of rows) {
    const campaign = detectCampaignFromDate(row.date_livraison);
    const key = `${row.connaissement}||${row.projet}||${row.destination}||${campaign}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}
