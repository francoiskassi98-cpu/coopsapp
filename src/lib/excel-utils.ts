import * as XLSX from "xlsx";

export interface ProducerRow {
  cooperative: string;
  full_name: string;
  producer_number: string;
  national_id: string;
  producer_code: string;
  section: string;
  total_cocoa_area: number;
  num_plots: number;
  plantation_code: string;
  delivery_potential: number;
  plantation_area: number;
  latitude: number;
  longitude: number;
}

export interface ImportError {
  row: number;
  message: string;
}

const COLUMN_MAP: Record<string, keyof ProducerRow> = {
  "coopérative": "cooperative",
  "cooperative": "cooperative",
  "nom complet": "full_name",
  "nom": "full_name",
  "n° producteur": "producer_number",
  "numero producteur": "producer_number",
  "cni": "national_id",
  "code producteur": "producer_code",
  "section": "section",
  "surface cacao totale": "total_cocoa_area",
  "surface cacao": "total_cocoa_area",
  "nombre parcelles": "num_plots",
  "parcelles": "num_plots",
  "code plantation": "plantation_code",
  "potentiel livraison": "delivery_potential",
  "potentiel livraison (kg)": "delivery_potential",
  "potentiel": "delivery_potential",
  "surface plantation": "plantation_area",
  "latitude": "latitude",
  "longitude": "longitude",
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-]/g, " ").replace(/\s+/g, " ");
}

export function parseExcelFile(data: ArrayBuffer): { rows: ProducerRow[]; errors: ImportError[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

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

    rows.push({
      cooperative: String(row.cooperative || "").trim(),
      full_name: String(row.full_name).trim(),
      producer_number: String(row.producer_number || "").trim(),
      national_id: String(row.national_id || "").trim(),
      producer_code: String(row.producer_code || "").trim(),
      section: String(row.section).trim(),
      total_cocoa_area: Number(row.total_cocoa_area) || 0,
      num_plots: Number(row.num_plots) || 0,
      plantation_code: code,
      delivery_potential: Number(row.delivery_potential) || 0,
      plantation_area: Number(row.plantation_area) || 0,
      latitude: Number(row.latitude) || 0,
      longitude: Number(row.longitude) || 0,
    });
  }

  return { rows, errors };
}

export function exportToExcel(
  data: Record<string, any>[],
  filename: string,
  sheetName = "Données"
) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
