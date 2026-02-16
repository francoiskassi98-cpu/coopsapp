import * as XLSX from "xlsx";

export interface ShipmentImportRow {
  connaissement: string;
  projet: string;
  partenaire: string;
  zone: string;
  destination: string;
  campagne: string;
  poids_total: number;
  nombre_sacs: number;
  date_debut_livraison: string;
  date_fin_livraison: string;
  nom_producteur: string;
  code_plantation: string;
  section: string;
  poids_net: number;
  nombre_sacs_producteur: number;
  date_livraison: string;
  numero_recu: string;
}

export interface ShipmentImportError {
  row: number;
  message: string;
}

export const SHIPMENT_TEMPLATE_COLUMNS: { header: string; field: keyof ShipmentImportRow }[] = [
  { header: "Connaissement", field: "connaissement" },
  { header: "Projet", field: "projet" },
  { header: "Partenaire", field: "partenaire" },
  { header: "Zone", field: "zone" },
  { header: "Destination", field: "destination" },
  { header: "Campagne", field: "campagne" },
  { header: "Poids total (kg)", field: "poids_total" },
  { header: "Nombre de sacs", field: "nombre_sacs" },
  { header: "Date début livraison", field: "date_debut_livraison" },
  { header: "Date fin livraison", field: "date_fin_livraison" },
  { header: "Nom du producteur", field: "nom_producteur" },
  { header: "Code plantation", field: "code_plantation" },
  { header: "Section", field: "section" },
  { header: "Poids net (kg)", field: "poids_net" },
  { header: "Nombre de sacs producteur", field: "nombre_sacs_producteur" },
  { header: "Date de livraison", field: "date_livraison" },
  { header: "N° Reçu", field: "numero_recu" },
];

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-°]/g, " ").replace(/\s+/g, " ");
}

const SHIPMENT_COLUMN_MAP: Record<string, keyof ShipmentImportRow> = {};
for (const col of SHIPMENT_TEMPLATE_COLUMNS) {
  SHIPMENT_COLUMN_MAP[normalizeHeader(col.header)] = col.field;
}

function parseExcelDate(value: any): string {
  if (!value) return "";
  if (typeof value === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  const str = String(value).trim();
  // Try yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Try dd/mm/yyyy
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
    if (SHIPMENT_COLUMN_MAP[normalized]) {
      headerMap[key] = SHIPMENT_COLUMN_MAP[normalized];
    }
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

    // Validate required fields
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

    rows.push({
      connaissement: String(row.connaissement || "").trim(),
      projet: String(row.projet || "").trim(),
      partenaire: String(row.partenaire || "").trim(),
      zone: String(row.zone || "").trim(),
      destination: String(row.destination || "").trim(),
      campagne: String(row.campagne || "").trim(),
      poids_total: Number(row.poids_total) || 0,
      nombre_sacs: Number(row.nombre_sacs) || 0,
      date_debut_livraison: parseExcelDate(row.date_debut_livraison),
      date_fin_livraison: parseExcelDate(row.date_fin_livraison),
      nom_producteur: String(row.nom_producteur).trim(),
      code_plantation: String(row.code_plantation).trim(),
      section: String(row.section || "").trim(),
      poids_net: Number(row.poids_net) || 0,
      nombre_sacs_producteur: Number(row.nombre_sacs_producteur) || 0,
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
    const key = `${row.connaissement}||${row.projet}||${row.destination}||${row.campagne}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}
