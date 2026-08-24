import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

interface TemplateConfig {
  title: string;
  subtitle: string | null;
  slogan: string | null;
  coop_logo_path: string | null;
  partner_logo_path: string | null;
  logo_position: "left" | "center" | "right" | "split";
  custom_header: string | null;
  custom_footer: string | null;
  show_driver: boolean;
  show_truck: boolean;
  show_trailer: boolean;
  show_bill_of_lading: boolean;
  show_destination: boolean;
  show_project: boolean;
  show_partner: boolean;
  show_departure_date: boolean;
  show_num_bags: boolean;
  show_total_weight: boolean;
  show_num_producers: boolean;
  show_partner_logo: boolean;
}

interface ShipmentFicheRow {
  id: string;
  connaissement: string | null;
  lot_number: string | null;
  project: string | null;
  destination: string | null;
  total_weight: number | null;
  total_bags: number | null;
  delivery_start: string | null;
  departure_date: string | null;
  driver_name: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  registre_id: string | null;
  partner_id: string | null;
  registres?: { name: string | null; cooperatives?: { name: string | null } | null } | null;
  partners?: { name: string | null } | null;
}

interface DeliveryFicheRow {
  receipt_number: string | null;
  delivery_date: string | null;
  net_weight: number | null;
  num_bags: number | null;
  producers?: { full_name: string | null; section: string | null; plantation_code: string | null } | null;
}

const FALLBACK_TEMPLATE: TemplateConfig = {
  title: "FICHE D'ACCOMPAGNEMENT CAMPAGNE",
  subtitle: null,
  slogan: null,
  coop_logo_path: null,
  partner_logo_path: null,
  logo_position: "split",
  custom_header: null,
  custom_footer: null,
  show_driver: true,
  show_truck: true,
  show_trailer: true,
  show_bill_of_lading: true,
  show_destination: true,
  show_project: true,
  show_partner: true,
  show_departure_date: true,
  show_num_bags: true,
  show_total_weight: true,
  show_num_producers: true,
  show_partner_logo: true,
};

async function loadTemplate(registreId: string | null): Promise<TemplateConfig> {
  if (!registreId) return FALLBACK_TEMPLATE;
  const { data } = await supabase
    .from("shipment_excel_templates")
    .select("*")
    .eq("registre_id", registreId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data && data[0]) || null;
  if (!row) return FALLBACK_TEMPLATE;
  return { ...FALLBACK_TEMPLATE, ...row } as TemplateConfig;
}

// Accepte soit un path interne Storage (préféré), soit une URL legacy.
// Préférence par défaut : bucket "shipment-assets" (modèles de chargement).
async function fetchImage(pathOrUrl: string, defaultBucket = "shipment-assets"): Promise<ArrayBuffer | null> {
  try {
    let finalUrl = pathOrUrl;
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const m = pathOrUrl.match(/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
      if (m) {
        const bucket = m[1];
        const path = decodeURIComponent(m[2]);
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
        if (signed?.signedUrl) finalUrl = signed.signedUrl;
      }
    } else {
      // Path interne — générer une signed URL depuis le bucket par défaut
      const { data: signed } = await supabase.storage.from(defaultBucket).createSignedUrl(pathOrUrl, 120);
      if (!signed?.signedUrl) return null;
      finalUrl = signed.signedUrl;
    }
    const res = await fetch(finalUrl);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch (e) {
    console.error("logo load failed", e);
    return null;
  }
}

function extOf(url: string): "png" | "jpeg" {
  return /\.jpe?g(\?|$)/i.test(url) ? "jpeg" : "png";
}

// ============================================================================
// Layout EXACTEMENT conforme au modèle fourni (FICHIER EXEMPLE.xlsx)
// - A4 Paysage
// - Largeurs colonnes fixes A=8, B=35, C=18, D=20, E=25, F=28, G=22, H=20
// - Titre A1:H1 fusionné
// - Logos physiques (coop gauche, partenaire droite) en overlay sur la ligne 1
// - Bloc infos en horizontal lignes 2-11 (fusions A:B, C:D, F:G)
// - Tableau producteurs commence STRICTEMENT à la ligne 13
// ============================================================================
export async function buildShipmentFicheWorkbook(shipmentId: string): Promise<{ wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet; fileName: string; tpl: TemplateConfig }> {
  const { data: shipment, error: sErr } = await supabase
    .from("shipments")
    .select(
      "id, connaissement, lot_number, project, destination, total_weight, total_bags, delivery_start, departure_date, driver_name, truck_number, trailer_number, registre_id, partner_id, registres(name, cooperatives(name)), partners(name)"
    )
    .eq("id", shipmentId)
    .returns<ShipmentFicheRow[]>()
    .maybeSingle();
  if (sErr || !shipment) throw new Error("Chargement introuvable");

  const sh: ShipmentFicheRow = shipment;
  const tpl = await loadTemplate(sh.registre_id);

  const { data: deliveries, error: dErr } = await supabase
    .from("deliveries")
    .select(
      "receipt_number, delivery_date, net_weight, num_bags, producers(full_name, section, plantation_code)"
    )
    .eq("shipment_id", shipmentId)
    .order("receipt_number", { ascending: true })
    .returns<DeliveryFicheRow[]>();
  if (dErr) throw dErr;

  const rows: DeliveryFicheRow[] = deliveries || [];
  const uniqueProducers = new Set(
    rows.map((r) => r.producers?.plantation_code).filter(Boolean)
  ).size;

  const coopName = sh.registres?.cooperatives?.name || sh.registres?.name || "—";
  const partnerName = sh.partners?.name || "—";

  // ===== Workbook =====
  const wb = new ExcelJS.Workbook();
  wb.creator = "COOPS APP";
  const ws = wb.addWorksheet("Fiche d'accompagnement", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  // Largeurs de colonnes fixes (obligatoire — ne jamais laisser Excel auto-générer)
  const widths = [8, 35, 18, 20, 25, 28, 22, 20];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const thin: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const font = { name: "Calibri" };

  const center = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
  const leftMid = { horizontal: "left" as const, vertical: "middle" as const, wrapText: true, indent: 1 };

  const borderRange = (range: string) => {
    const [start, end] = range.split(":");
    const c1 = start.match(/([A-Z]+)(\d+)/)!;
    const c2 = end.match(/([A-Z]+)(\d+)/)!;
    const col1 = c1[1].charCodeAt(0) - 64;
    const col2 = c2[1].charCodeAt(0) - 64;
    const row1 = parseInt(c1[2]);
    const row2 = parseInt(c2[2]);
    for (let r = row1; r <= row2; r++) {
      for (let c = col1; c <= col2; c++) {
        ws.getCell(r, c).border = thin;
      }
    }
  };

  // ===== LIGNE 1 — TITRE PRINCIPAL =====
  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = tpl.title || FALLBACK_TEMPLATE.title;
  title.font = { ...font, bold: true, size: 16 };
  title.alignment = center;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  borderRange("A1:H1");
  ws.getRow(1).height = 70;

  // ===== LOGOS — images physiques en overlay ligne 1 =====
  const addLogo = async (url: string, col: number, width = 90, height = 60) => {
    const buf = await fetchImage(url);
    if (!buf) return;
    const imgId = wb.addImage({ buffer: buf, extension: extOf(url) });
    ws.addImage(imgId, {
      tl: { col, row: 0 },
      ext: { width, height },
      editAs: "oneCell",
    });
  };
  if (tpl.coop_logo_path) {
    // En haut à gauche (colonne A)
    await addLogo(tpl.coop_logo_path, 0.1);
  }
  if (tpl.show_partner_logo && tpl.partner_logo_path) {
    // En haut à droite (colonne H, à droite de l'image)
    await addLogo(tpl.partner_logo_path, 7.05);
  }

  // ============================================================
  // BLOC INFOS HORIZONTAL — Lignes 2 à 11
  // Fusions standard : A:B (label gauche), C:D (valeur gauche),
  //                    F:G (label droite), H (valeur droite)
  // E reste séparateur visuel
  // ============================================================
  const writeLabel = (cell: ExcelJS.Cell, text: string) => {
    cell.value = text;
    cell.font = { ...font, bold: true, size: 11 };
    cell.alignment = leftMid;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  };
  const writeValue = (cell: ExcelJS.Cell, value: ExcelJS.CellValue, numFmt?: string) => {
    cell.value = value;
    cell.font = { ...font, size: 11 };
    cell.alignment = leftMid;
    if (numFmt) cell.numFmt = numFmt;
  };

  const setInfoRow = (
    rowIdx: number,
    leftLabel: string,
    leftValue: ExcelJS.CellValue,
    rightLabel?: string,
    rightValue?: ExcelJS.CellValue,
    leftFmt?: string,
    rightFmt?: string
  ) => {
    ws.mergeCells(`A${rowIdx}:B${rowIdx}`);
    ws.mergeCells(`C${rowIdx}:D${rowIdx}`);
    ws.mergeCells(`F${rowIdx}:G${rowIdx}`);
    writeLabel(ws.getCell(`A${rowIdx}`), leftLabel);
    writeValue(ws.getCell(`C${rowIdx}`), leftValue, leftFmt);
    if (rightLabel !== undefined) {
      writeLabel(ws.getCell(`F${rowIdx}`), rightLabel);
      writeValue(ws.getCell(`H${rowIdx}`), rightValue, rightFmt);
    }
    ws.getRow(rowIdx).height = 22;
    borderRange(`A${rowIdx}:H${rowIdx}`);
  };

  // Ligne 2 — Fournisseur / Statut projet
  setInfoRow(
    2,
    "Fournisseur :",
    coopName,
    tpl.show_project ? "Statut projet :" : undefined,
    tpl.show_project ? (sh.project || "—").toString().toUpperCase() : undefined
  );

  // Ligne 3 — Chauffeur / Destination
  setInfoRow(
    3,
    tpl.show_driver ? "Nom du Chauffeur :" : "",
    tpl.show_driver ? (sh.driver_name || "—") : "",
    tpl.show_destination ? "Destination :" : undefined,
    tpl.show_destination ? (sh.destination || "—") : undefined
  );

  // Ligne 4 — Camion / Partenaire
  setInfoRow(
    4,
    tpl.show_truck ? "N° du Camion :" : "",
    tpl.show_truck ? (sh.truck_number || "—") : "",
    tpl.show_partner ? "Partenaire :" : undefined,
    tpl.show_partner ? partnerName : undefined
  );

  // Ligne 5 — Remorque / Connaissement (placé strictement à droite)
  setInfoRow(
    5,
    tpl.show_trailer ? "N° de Remorque :" : "",
    tpl.show_trailer ? (sh.trailer_number || "—") : "",
    tpl.show_bill_of_lading ? "N° de connaissement :" : undefined,
    tpl.show_bill_of_lading ? (sh.connaissement || "—") : undefined
  );

  // Ligne 6 — N° de lot / Date départ
  const depDate = sh.departure_date || sh.delivery_start;
  setInfoRow(
    6,
    "N° de lot :",
    sh.lot_number || "—",
    tpl.show_departure_date ? "Date de départ :" : undefined,
    tpl.show_departure_date ? (depDate ? new Date(depDate) : "—") : undefined,
    undefined,
    "dd/mm/yyyy"
  );

  // Ligne 7 — Poids total / Nombre de sacs
  setInfoRow(
    7,
    tpl.show_total_weight ? "Poids total (Kg) :" : "",
    tpl.show_total_weight ? (Number(sh.total_weight) || 0) : "",
    tpl.show_num_bags ? "Nombre de sacs :" : undefined,
    tpl.show_num_bags ? (Number(sh.total_bags) || 0) : undefined,
    "#,##0",
    "#,##0"
  );

  // Ligne 8 — Nombre de producteurs
  setInfoRow(
    8,
    tpl.show_num_producers ? "Nombre de producteurs :" : "",
    tpl.show_num_producers ? uniqueProducers : ""
  );

  // Lignes 9-11 — slogan/sous-titre éventuels (centrés, fusionnés)
  const fillExtra = (rowIdx: number, text: string | null, opts?: { italic?: boolean; bold?: boolean }) => {
    ws.mergeCells(`A${rowIdx}:H${rowIdx}`);
    const c = ws.getCell(`A${rowIdx}`);
    c.value = text || "";
    c.font = { ...font, size: 10, italic: !!opts?.italic, bold: !!opts?.bold, color: { argb: "FF555555" } };
    c.alignment = center;
    borderRange(`A${rowIdx}:H${rowIdx}`);
    ws.getRow(rowIdx).height = 18;
  };
  fillExtra(9, tpl.subtitle, { bold: true });
  fillExtra(10, tpl.slogan, { italic: true });
  fillExtra(11, tpl.custom_header, {});

  // Ligne 12 — séparateur vide (bordée pour continuité visuelle)
  ws.getRow(12).height = 8;
  borderRange("A12:H12");

  // ============================================================
  // LIGNE 13 — EN-TÊTES TABLEAU PRODUCTEURS (position fixe)
  // ============================================================
  const HEADER_ROW = 13;
  const headers = [
    "N°",
    "Nom et Prénoms Planteur",
    "N° de reçu",
    "Section",
    "Code Plantation",
    "Date de livraison au magasin",
    "Poids net livré (Kg)",
    "Nombre de sacs livrés",
  ];
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
  const headerRow = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { ...font, bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.alignment = center;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
    cell.border = thin;
  });
  headerRow.height = 38;

  // ============================================================
  // LIGNES PRODUCTEURS — dynamiques uniquement
  // ============================================================
  let r = HEADER_ROW + 1;
  rows.forEach((d, idx) => {
    const row = ws.getRow(r);
    const values: ExcelJS.CellValue[] = [
      idx + 1,
      d.producers?.full_name || "",
      d.receipt_number || "",
      d.producers?.section || "",
      d.producers?.plantation_code || "",
      d.delivery_date ? new Date(d.delivery_date) : "",
      Number(d.net_weight) || 0,
      Number(d.num_bags) || 0,
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { ...font, size: 10 };
      cell.border = thin;
      cell.alignment = {
        vertical: "middle",
        horizontal: i === 1 || i === 4 ? "left" : "center",
        indent: i === 1 ? 1 : 0,
        wrapText: true,
      };
    });
    row.getCell(6).numFmt = "dd/mm/yyyy";
    row.getCell(7).numFmt = "#,##0";
    row.height = 20;
    r += 1;
  });

  // ===== LIGNE TOTAL =====
  const totalWeight = rows.reduce((s, d) => s + (Number(d.net_weight) || 0), 0);
  const totalBags = rows.reduce((s, d) => s + (Number(d.num_bags) || 0), 0);
  ws.mergeCells(`A${r}:F${r}`);
  const totalLabel = ws.getCell(`A${r}`);
  totalLabel.value = "TOTAL";
  totalLabel.font = { ...font, bold: true, size: 11 };
  totalLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  for (let c = 1; c <= 6; c++) ws.getCell(r, c).border = thin;
  const tw = ws.getCell(r, 7);
  tw.value = totalWeight;
  tw.numFmt = "#,##0";
  tw.font = { ...font, bold: true };
  tw.alignment = center;
  tw.border = thin;
  tw.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  const tb = ws.getCell(r, 8);
  tb.value = totalBags;
  tb.font = { ...font, bold: true };
  tb.alignment = center;
  tb.border = thin;
  tb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  ws.getRow(r).height = 24;
  r += 1;

  // ===== Pied personnalisé éventuel =====
  if (tpl.custom_footer && tpl.custom_footer.trim()) {
    r += 1;
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = tpl.custom_footer;
    c.font = { ...font, size: 9, italic: true, color: { argb: "FF555555" } };
    c.alignment = center;
    ws.getRow(r).height = 24;
  }

  const safeCoop = (coopName || "Coop").replace(/[^a-z0-9-]+/gi, "_");
  const safeLot = (sh.lot_number || sh.connaissement || sh.id.slice(0, 6)).replace(/[^a-z0-9-]+/gi, "_");
  const fileName = `Fiche-Accompagnement-${safeCoop}-${safeLot}.xlsx`;
  return { wb, ws, fileName, tpl };
}

export async function generateShipmentFiche(shipmentId: string): Promise<void> {
  const { wb, fileName } = await buildShipmentFicheWorkbook(shipmentId);
  await downloadWorkbook(wb, fileName);
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Aperçu HTML — convertit la feuille en table HTML stylée pour valider
// visuellement la fidélité de la mise en page avant téléchargement.
// ============================================================================
function argbToCss(argb?: string): string | undefined {
  if (!argb) return undefined;
  const v = argb.length === 8 ? argb.slice(2) : argb;
  return `#${v}`;
}

interface MergeRange { top: number; left: number; bottom: number; right: number }

function buildMergeMap(ws: ExcelJS.Worksheet): {
  masters: Map<string, { rowSpan: number; colSpan: number }>;
  occupied: Set<string>;
} {
  const masters = new Map<string, { rowSpan: number; colSpan: number }>();
  const occupied = new Set<string>();
  const internal = ws as unknown as { _merges?: Record<string, MergeRange> };
  const mergeMap = internal._merges || {};
  for (const key of Object.keys(mergeMap)) {
    const m = mergeMap[key];
    const top = m.top, left = m.left, bottom = m.bottom, right = m.right;
    masters.set(`${top}:${left}`, { rowSpan: bottom - top + 1, colSpan: right - left + 1 });
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (!(r === top && c === left)) occupied.add(`${r}:${c}`);
      }
    }
  }
  return { masters, occupied };
}

function formatCellValue(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  if (typeof v === "number") {
    const fmt = (cell.numFmt || "").toString();
    if (fmt.includes("#,##0")) return v.toLocaleString("fr-FR");
    return String(v);
  }
  if (typeof v === "object" && v !== null && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
  return String(v);
}

export async function renderShipmentFicheHtml(shipmentId: string): Promise<{
  html: string;
  wb: ExcelJS.Workbook;
  fileName: string;
}> {
  const { wb, ws, fileName, tpl } = await buildShipmentFicheWorkbook(shipmentId);

  const colCount = 8;
  // Largeur ExcelJS -> px approx (1 char ≈ 7 px)
  const colWidthsPx: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    const w = ws.getColumn(c).width || 10;
    colWidthsPx.push(Math.round(w * 7.5));
  }
  const totalWidthPx = colWidthsPx.reduce((a, b) => a + b, 0);

  const { masters, occupied } = buildMergeMap(ws);

  let body = "";
  const lastRow = ws.actualRowCount || ws.rowCount;
  for (let r = 1; r <= lastRow; r++) {
    const rowH = ws.getRow(r).height || 18;
    body += `<tr style="height:${Math.round(rowH * 1.2)}px;">`;
    for (let c = 1; c <= colCount; c++) {
      if (occupied.has(`${r}:${c}`)) continue;
      const merge = masters.get(`${r}:${c}`);
      const cell = ws.getCell(r, c);
      const text = formatCellValue(cell);

      const font: Partial<ExcelJS.Font> = cell.font || {};
      const fill = (cell.fill || {}) as Partial<ExcelJS.FillPattern>;
      const align: Partial<ExcelJS.Alignment> = cell.alignment || {};
      const bg = fill.fgColor?.argb ? argbToCss(fill.fgColor.argb) : undefined;
      const color = font.color?.argb ? argbToCss(font.color.argb) : "#111";
      const border = cell.border?.top ? "1px solid #999" : "1px solid #e5e5e5";

      const style = [
        `border:${border}`,
        bg ? `background:${bg}` : "",
        `color:${color}`,
        font.bold ? "font-weight:700" : "",
        font.italic ? "font-style:italic" : "",
        `font-size:${(font.size || 11)}px`,
        `font-family:${font.name || "Calibri"},sans-serif`,
        `text-align:${align.horizontal || "left"}`,
        `vertical-align:${align.vertical === "middle" ? "middle" : (align.vertical || "top")}`,
        align.wrapText ? "white-space:normal;word-break:break-word" : "white-space:nowrap",
        "padding:4px 6px",
        align.indent ? `padding-left:${4 + (align.indent || 0) * 8}px` : "",
      ]
        .filter(Boolean)
        .join(";");

      const span = merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.colSpan}"` : "";
      body += `<td${span} style="${style}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</td>`;
    }
    body += "</tr>";
  }

  const colgroup = colWidthsPx.map((w) => `<col style="width:${w}px"/>`).join("");

  const html = `
<div style="background:#fff;color:#111;padding:16px;overflow:auto;">
  <table style="border-collapse:collapse;table-layout:fixed;width:${totalWidthPx}px;background:#fff;">
    <colgroup>${colgroup}</colgroup>
    <tbody>${body}</tbody>
  </table>
  ${tpl.custom_footer ? `<div style="margin-top:8px;font-size:10px;color:#666;font-style:italic;text-align:center;">${tpl.custom_footer}</div>` : ""}
</div>`.trim();

  return { html, wb, fileName };
}
