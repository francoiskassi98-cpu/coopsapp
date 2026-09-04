import ExcelJS from "exceljs";
import { computeCampaign } from "@/lib/campaign";

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

/** Destinations autorisées (identiques à la contrainte SQL shipments_destination_check). */
export const VALID_DESTINATIONS = ["Abidjan", "San-Pedro"] as const;
/** Poids maximum par sac accepté par la base (deliveries_bag_weight_check). */
export const MAX_BAG_WEIGHT_KG = 110;

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

/**
 * Campagne d'une date de livraison — règle unique du système
 * (1er septembre → 31 août, format "YYYY-YYYY").
 */
export function detectCampaignFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return computeCampaign(d);
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

function parseExcelDate(value: ExcelJS.CellValue): string {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return str;
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
      // ExcelJS renvoie des objets Date pour les cellules de type date
      if (key) obj[key] = cell.value;
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return rows;
}


export async function parseShipmentExcel(data: ArrayBuffer): Promise<{ rows: ShipmentImportRow[]; errors: ShipmentImportError[] }> {
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

  const errors: ShipmentImportError[] = [];
  const rows: ShipmentImportRow[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /** Retourne la valeur entière stricte d'une cellule, ou null si non entière. */
  function strictInteger(v: ExcelJS.CellValue): number | null {
    if (v === null || v === undefined) return null;
    const s = String(typeof v === "object" && v !== null && "result" in v ? (v as { result: unknown }).result : v)
      .trim()
      .replace(/\s/g, "");
    if (s === "" || !/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
  }

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2;

    const row: Partial<Record<keyof ShipmentImportRow, ExcelJS.CellValue>> = {};
    for (const [excelKey, fieldKey] of Object.entries(headerMap)) {
      row[fieldKey] = raw[excelKey];
    }

    const rowErrors: string[] = [];

    const nomProducteur = String(row.nom_producteur ?? "").trim();
    const codePlantation = String(row.code_plantation ?? "").trim();
    const numeroRecu = String(row.numero_recu ?? "").trim();
    const zone = String(row.zone ?? "").trim();
    const destinationRaw = String(row.destination ?? "").trim();
    const projet = String(row.projet ?? "").trim();
    const dateLivraison = parseExcelDate(row.date_livraison);

    if (!nomProducteur) rowErrors.push("Nom du producteur manquant");
    if (!codePlantation) rowErrors.push("Code plantation manquant");
    if (!numeroRecu) rowErrors.push("N° Reçu manquant");
    if (!zone) rowErrors.push("Zone (registre) manquante");
    if (!projet) rowErrors.push("Projet manquant");

    // Destination : doit correspondre exactement aux valeurs acceptées par la base
    const destination = VALID_DESTINATIONS.find((d) => d.toLowerCase() === destinationRaw.toLowerCase());
    if (!destinationRaw) rowErrors.push("Destination manquante");
    else if (!destination) rowErrors.push(`Destination « ${destinationRaw} » invalide (attendu : ${VALID_DESTINATIONS.join(" ou ")})`);

    // Poids net : entier strictement positif (contrainte deliveries_integer_amounts_chk)
    const poids = strictInteger(row.poids_net);
    if (row.poids_net === null || row.poids_net === undefined || String(row.poids_net).trim() === "") {
      rowErrors.push("Poids net manquant");
    } else if (poids === null) {
      rowErrors.push(`Poids net « ${String(row.poids_net)} » invalide (nombre entier de kg attendu, sans décimale)`);
    } else if (poids <= 0) {
      rowErrors.push("Poids net doit être supérieur à 0");
    }

    // Nombre de sacs : entier >= 1
    const sacs = strictInteger(row.nombre_sacs);
    if (row.nombre_sacs === null || row.nombre_sacs === undefined || String(row.nombre_sacs).trim() === "") {
      rowErrors.push("Nombre de sacs manquant");
    } else if (sacs === null) {
      rowErrors.push(`Nombre de sacs « ${String(row.nombre_sacs)} » invalide (nombre entier attendu)`);
    } else if (sacs < 1) {
      rowErrors.push("Nombre de sacs doit être supérieur ou égal à 1");
    }

    // Poids par sac : contrainte deliveries_bag_weight_check (<= 110 kg)
    if (poids !== null && poids > 0 && sacs !== null && sacs >= 1 && poids / sacs > MAX_BAG_WEIGHT_KG) {
      rowErrors.push(`Poids par sac de ${(poids / sacs).toFixed(1)} kg supérieur au maximum autorisé (${MAX_BAG_WEIGHT_KG} kg)`);
    }

    // Date de livraison : obligatoire, valide, jamais dans le futur (trigger validate_shipment_rules)
    if (!dateLivraison) {
      rowErrors.push("Date de livraison manquante");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLivraison) || isNaN(new Date(dateLivraison).getTime())) {
      rowErrors.push(`Date de livraison « ${dateLivraison} » invalide (format attendu : JJ/MM/AAAA)`);
    } else if (new Date(`${dateLivraison}T00:00:00`) > today) {
      rowErrors.push("Pas possible d'effectuer un chargement avec cette date.");
    }

    if (rowErrors.length > 0) {
      for (const message of rowErrors) errors.push({ row: rowNum, message });
      continue;
    }

    rows.push({
      connaissement: String(row.connaissement || "").trim(),
      projet,
      partenaire: String(row.partenaire || "").trim(),
      zone,
      destination: destination as string,
      nom_producteur: nomProducteur,
      code_plantation: codePlantation,
      section: String(row.section || "").trim(),
      poids_net: poids as number,
      nombre_sacs: sacs as number,
      date_livraison: dateLivraison,
      numero_recu: numeroRecu,
    });
  }


  return { rows, errors };
}

export async function downloadShipmentTemplate() {
  const headers = SHIPMENT_TEMPLATE_COLUMNS.map((c) => c.header);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Chargements");

  ws.columns = headers.map((h) => ({ header: h, width: Math.max(h.length + 2, 18) }));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Knf-Modèle-Import-Chargements.xlsx";
  a.click();
  URL.revokeObjectURL(url);
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
