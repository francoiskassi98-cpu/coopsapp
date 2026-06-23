import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

interface TemplateConfig {
  title: string;
  subtitle: string | null;
  slogan: string | null;
  coop_logo_url: string | null;
  partner_logo_url: string | null;
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

const FALLBACK_TEMPLATE: TemplateConfig = {
  title: "FICHE D'ACCOMPAGNEMENT CAMPAGNE",
  subtitle: null,
  slogan: null,
  coop_logo_url: null,
  partner_logo_url: null,
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

async function loadTemplate(cooperativeId: string | null): Promise<TemplateConfig> {
  if (!cooperativeId) return FALLBACK_TEMPLATE;
  const { data } = await (supabase.from("shipment_excel_templates") as any)
    .select("*")
    .eq("cooperative_id", cooperativeId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data && data[0]) || null;
  if (!row) return FALLBACK_TEMPLATE;
  return { ...FALLBACK_TEMPLATE, ...row } as TemplateConfig;
}

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    let finalUrl = url;
    const m = url.match(/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (m) {
      const bucket = m[1];
      const path = decodeURIComponent(m[2]);
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
      if (signed?.signedUrl) finalUrl = signed.signedUrl;
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
export async function generateShipmentFiche(shipmentId: string): Promise<void> {
  const { data: shipment, error: sErr } = await supabase
    .from("shipments")
    .select(
      "id, connaissement, lot_number, project, destination, total_weight, total_bags, delivery_start, departure_date, driver_name, truck_number, trailer_number, cooperative_id, partner_id, cooperatives(name), partners(name)"
    )
    .eq("id", shipmentId)
    .maybeSingle();
  if (sErr || !shipment) throw new Error("Chargement introuvable");

  const tpl = await loadTemplate((shipment as any).cooperative_id);

  const { data: deliveries, error: dErr } = await supabase
    .from("deliveries")
    .select(
      "receipt_number, delivery_date, net_weight, num_bags, producers(full_name, section, plantation_code)"
    )
    .eq("shipment_id", shipmentId)
    .order("receipt_number", { ascending: true });
  if (dErr) throw dErr;

  const rows = deliveries || [];
  const uniqueProducers = new Set(
    rows.map((r: any) => r.producers?.plantation_code).filter(Boolean)
  ).size;

  const sh: any = shipment;
  const coopName = sh.cooperatives?.name || "—";
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
      tl: { col, row: 0 } as any,
      ext: { width, height },
      editAs: "oneCell",
    });
  };
  if (tpl.coop_logo_url) {
    // En haut à gauche (colonne A)
    await addLogo(tpl.coop_logo_url, 0.1);
  }
  if (tpl.show_partner_logo && tpl.partner_logo_url) {
    // En haut à droite (colonne H, à droite de l'image)
    await addLogo(tpl.partner_logo_url, 7.05);
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
  const writeValue = (cell: ExcelJS.Cell, value: any, numFmt?: string) => {
    cell.value = value;
    cell.font = { ...font, size: 11 };
    cell.alignment = leftMid;
    if (numFmt) cell.numFmt = numFmt;
  };

  const setInfoRow = (
    rowIdx: number,
    leftLabel: string,
    leftValue: any,
    rightLabel?: string,
    rightValue?: any,
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
  rows.forEach((d: any, idx: number) => {
    const row = ws.getRow(r);
    const values = [
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
      cell.value = v as any;
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
  const totalWeight = rows.reduce((s: number, d: any) => s + (Number(d.net_weight) || 0), 0);
  const totalBags = rows.reduce((s: number, d: any) => s + (Number(d.num_bags) || 0), 0);
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

  // ===== Téléchargement =====
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeCoop = (coopName || "Coop").replace(/[^a-z0-9-]+/gi, "_");
  const safeLot = (sh.lot_number || sh.connaissement || sh.id.slice(0, 6)).replace(/[^a-z0-9-]+/gi, "_");
  a.href = url;
  a.download = `Fiche-Accompagnement-${safeCoop}-${safeLot}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
