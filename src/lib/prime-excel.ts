import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

export interface PrimeRowExport {
  producer_id: string;
  producer_code: string;
  full_name: string;
  section: string;
  cooperative?: string;
  num_plantations: number;
  volume: number;
  rate: number;
  bonus: number;
}


export interface PrimeExcelParams {
  cooperativeName: string;
  /** Nom du projet filtré (optionnel). */
  projectName?: string | null;
  /** Path interne Storage (bucket cooperative-logos) ou URL legacy. */
  logoUrl?: string | null;
  startDate: string;
  endDate: string;
  bonusType: "total" | "per_kg";
  amount: number;
  rows: PrimeRowExport[];
}

async function fetchImageAsBase64(pathOrUrl: string): Promise<{ base64: string; ext: "png" | "jpeg" } | null> {
  try {
    let finalUrl = pathOrUrl;
    if (!/^https?:\/\//i.test(pathOrUrl)) {
      const { data } = await supabase.storage.from("cooperative-logos").createSignedUrl(pathOrUrl, 120);
      if (!data?.signedUrl) return null;
      finalUrl = data.signedUrl;
    }
    const res = await fetch(finalUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    const base64 = btoa(bin);
    const ext = pathOrUrl.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    return { base64, ext };
  } catch (e) {
    console.error("logo fetch", e);
    return null;
  }
}

function frPeriod(start: string, end: string): string {
  const months = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const ds = new Date(start), de = new Date(end);
  if (ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear()) {
    return `${months[ds.getMonth()]}${ds.getFullYear()}`;
  }
  return `${months[ds.getMonth()]}${ds.getFullYear()}-${months[de.getMonth()]}${de.getFullYear()}`;
}

export async function generatePrimeExcel(p: PrimeExcelParams) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AgroServices";
  wb.created = new Date();
  const ws = wb.addWorksheet("Prime", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  ws.columns = [
    { width: 6 },
    { width: 18 },
    { width: 34 },
    { width: 20 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 20 },
  ];

  // Logo
  if (p.logoUrl) {
    const img = await fetchImageAsBase64(p.logoUrl);
    if (img) {
      const id = wb.addImage({ base64: img.base64, extension: img.ext });
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 90 } });
    }
  }

  // Title
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `PRIME PRODUCTEUR — ${p.cooperativeName.toUpperCase()}`;
  titleCell.font = { name: "Calibri", bold: true, size: 18, color: { argb: "FF0F172A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:H2");
  const subCell = ws.getCell("A2");
  subCell.value = `Période : ${p.startDate} → ${p.endDate}    •    ${p.bonusType === "per_kg" ? `Taux : ${p.amount} FCFA/kg` : `Enveloppe : ${p.amount.toLocaleString("fr-FR")} FCFA`}`;
  subCell.font = { name: "Calibri", italic: true, size: 11, color: { argb: "FF475569" } };
  subCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 20;

  ws.getRow(3).height = 8;

  // Table header
  const headerRow = ws.getRow(4);
  const headers = ["N°", "Code producteur", "Producteur", "Section", "Plantations", "Volume livré (Kg)", "Taux prime", "Montant prime (FCFA)"];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headerRow.height = 26;

  // Data rows
  let totalVol = 0, totalBonus = 0;
  p.rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = r.producer_code;
    row.getCell(3).value = r.full_name;
    row.getCell(4).value = r.section;
    row.getCell(5).value = r.num_plantations;
    row.getCell(6).value = r.volume;
    row.getCell(7).value = r.rate;
    row.getCell(8).value = Math.round(r.bonus);
    totalVol += r.volume;
    totalBonus += r.bonus;

    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).numFmt = '#,##0';

    const fill = idx % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = { top: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFCBD5E1" } }, right: { style: "thin", color: { argb: "FFCBD5E1" } } };
      const rightAligned = c === 1 || c === 5 || c >= 6;
      cell.alignment = { vertical: "middle", horizontal: rightAligned ? (c === 1 ? "center" : "right") : "left" };
      cell.font = { name: "Calibri", size: 11 };
    }
  });

  // Total row
  const totalRow = ws.getRow(5 + p.rows.length);
  totalRow.getCell(3).value = "TOTAL";
  totalRow.getCell(6).value = totalVol;
  totalRow.getCell(8).value = Math.round(totalBonus);
  totalRow.getCell(6).numFmt = '#,##0';
  totalRow.getCell(8).numFmt = '#,##0';
  for (let c = 1; c <= 8; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: "Calibri", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
    const rightAligned = c === 1 || c === 5 || c >= 6;
    cell.alignment = { vertical: "middle", horizontal: rightAligned ? (c === 1 ? "center" : "right") : "left" };
  }
  totalRow.height = 24;


  // Repeat header on print
  ws.pageSetup.printTitlesRow = "1:4";

  const filename = `Prime-${p.cooperativeName.replace(/\s+/g, "")}-${frPeriod(p.startDate, p.endDate)}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
