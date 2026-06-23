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
  logo_position: "left",
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
    // Tenter une URL signée si c'est un chemin dans un bucket privé
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "COOPS APP";
  const ws = wb.addWorksheet("Fiche", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddHeader: tpl.custom_header ? `&C${tpl.custom_header}` : undefined,
      oddFooter: tpl.custom_footer ? `&C${tpl.custom_footer}` : "&CPage &P / &N",
    },
  });

  const widths = [6, 32, 18, 18, 22, 24, 16, 12];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const thin: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const font = { name: "Calibri" };

  let r = 1;

  // ===== Logos (ligne 1, hauteur réservée) =====
  const hasCoopLogo = !!tpl.coop_logo_url;
  const hasPartnerLogo = tpl.show_partner_logo && !!tpl.partner_logo_url;
  if (hasCoopLogo || hasPartnerLogo) {
    ws.getRow(r).height = 60;
    ws.mergeCells(`A${r}:H${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    cell.border = thin;

    const addLogo = async (url: string, col: number) => {
      const buf = await fetchImage(url);
      if (!buf) return;
      const imgId = wb.addImage({ buffer: buf, extension: extOf(url) });
      ws.addImage(imgId, {
        tl: { col, row: r - 1 } as any,
        ext: { width: 110, height: 55 },
        editAs: "oneCell",
      });
    };

    if (tpl.logo_position === "split") {
      if (hasCoopLogo) await addLogo(tpl.coop_logo_url!, 0.2);
      if (hasPartnerLogo) await addLogo(tpl.partner_logo_url!, 6.2);
    } else {
      const baseCol = tpl.logo_position === "right" ? 6.2 : tpl.logo_position === "center" ? 3.2 : 0.2;
      if (hasCoopLogo) await addLogo(tpl.coop_logo_url!, baseCol);
      if (hasPartnerLogo) await addLogo(tpl.partner_logo_url!, baseCol + 1.5);
    }
    r += 1;
  }

  // ===== Titre =====
  ws.mergeCells(`A${r}:H${r}`);
  const title = ws.getCell(`A${r}`);
  title.value = tpl.title || FALLBACK_TEMPLATE.title;
  title.font = { ...font, bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  title.border = thin;
  ws.getRow(r).height = 34;
  r += 1;

  // Sous-titre
  if (tpl.subtitle && tpl.subtitle.trim()) {
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = tpl.subtitle;
    c.font = { ...font, bold: true, size: 12, color: { argb: "FF2E7D32" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thin;
    ws.getRow(r).height = 22;
    r += 1;
  }

  // Slogan
  if (tpl.slogan && tpl.slogan.trim()) {
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = tpl.slogan;
    c.font = { ...font, italic: true, size: 10, color: { argb: "FF555555" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thin;
    ws.getRow(r).height = 18;
    r += 1;
  }

  // Bandeau en-tête personnalisé (visible dans le doc)
  if (tpl.custom_header && tpl.custom_header.trim()) {
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = tpl.custom_header;
    c.font = { ...font, size: 9, color: { argb: "FF333333" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    c.border = thin;
    ws.getRow(r).height = 18;
    r += 1;
  }

  // ===== Bloc infos chargement =====
  const setInfo = (label: string, value: string | number | Date, rightLabel?: string, rightValue?: string | number | Date, numFmt?: string) => {
    const a = ws.getCell(`A${r}`);
    a.value = label;
    a.font = { ...font, bold: true };
    a.alignment = { vertical: "middle" };
    a.border = thin;
    ws.mergeCells(`B${r}:C${r}`);
    const c = ws.getCell(`B${r}`);
    c.value = value as any;
    c.font = { ...font };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.border = thin;
    if (numFmt) c.numFmt = numFmt;
    ws.getCell(`C${r}`).border = thin;
    ws.mergeCells(`D${r}:E${r}`);
    ws.getCell(`D${r}`).border = thin;
    ws.getCell(`E${r}`).border = thin;
    const f = ws.getCell(`F${r}`);
    if (rightLabel !== undefined) {
      f.value = rightLabel;
      f.font = { ...font, bold: true };
      f.alignment = { vertical: "middle", horizontal: "left" };
    }
    f.border = thin;
    ws.mergeCells(`G${r}:H${r}`);
    const g = ws.getCell(`G${r}`);
    if (rightValue !== undefined) {
      g.value = rightValue as any;
      g.font = { ...font };
      g.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    g.border = thin;
    ws.getCell(`H${r}`).border = thin;
    ws.getRow(r).height = 20;
    r += 1;
  };

  const sh: any = shipment;
  const coopName = sh.cooperatives?.name || "—";
  const partnerName = sh.partners?.name || "—";

  // Fournisseur + Statut(projet)
  setInfo(
    "Fournisseur :",
    coopName,
    tpl.show_project ? "Statut" : undefined,
    tpl.show_project ? (sh.project || "").toUpperCase() : undefined
  );

  // Chauffeur / connaissement (côté droit)
  if (tpl.show_driver) {
    setInfo(
      "Nom du Chauffeur :",
      sh.driver_name || "—",
      tpl.show_bill_of_lading ? "N° de connaissement" : undefined,
      tpl.show_bill_of_lading ? (sh.connaissement || "—") : undefined
    );
  } else if (tpl.show_bill_of_lading) {
    setInfo("N° de connaissement", sh.connaissement || "—");
  }

  if (tpl.show_truck) setInfo("N° du Camion :", sh.truck_number || "—");
  if (tpl.show_trailer) setInfo("N° de Remorque :", sh.trailer_number || "—");

  setInfo("N° de lot", sh.lot_number || "—");

  if (tpl.show_total_weight) {
    setInfo(
      "Poids total :",
      Number(sh.total_weight) || 0,
      tpl.show_destination ? "Destination" : undefined,
      tpl.show_destination ? (sh.destination || "—") : undefined,
      "#,##0"
    );
  } else if (tpl.show_destination) {
    setInfo("Destination", sh.destination || "—");
  }

  if (tpl.show_num_producers) setInfo("Nombre de producteurs", uniqueProducers);

  if (tpl.show_num_bags) {
    setInfo(
      "Nombre de sacs déclarés :",
      Number(sh.total_bags) || 0,
      tpl.show_partner ? "PARTENAIRE" : undefined,
      tpl.show_partner ? partnerName : undefined,
      "#,##0"
    );
  } else if (tpl.show_partner) {
    setInfo("PARTENAIRE", partnerName);
  }

  if (tpl.show_departure_date) {
    const d = sh.departure_date || sh.delivery_start;
    setInfo("Date départ :", d ? new Date(d) : "—", undefined, undefined, "dd/mm/yyyy");
  }

  // Espace
  ws.getRow(r).height = 6;
  r += 1;

  // ===== Définir la zone de répétition d'en-tête à l'impression =====
  const headerRowIdx = r;
  ws.pageSetup.printTitlesRow = `${headerRowIdx}:${headerRowIdx}`;

  // ===== En-tête tableau =====
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
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
    cell.border = thin;
  });
  headerRow.height = 36;
  r += 1;

  // ===== Lignes =====
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
      cell.font = { ...font };
      cell.border = thin;
      cell.alignment = {
        vertical: "middle",
        horizontal: i === 1 || i === 4 ? "left" : "center",
        indent: i === 1 ? 1 : 0,
      };
    });
    row.getCell(6).numFmt = "dd/mm/yyyy";
    row.getCell(7).numFmt = "#,##0";
    row.height = 18;
    r += 1;
  });

  // ===== TOTAL =====
  const totalWeight = rows.reduce((s: number, d: any) => s + (Number(d.net_weight) || 0), 0);
  const totalBags = rows.reduce((s: number, d: any) => s + (Number(d.num_bags) || 0), 0);
  const totalRow = ws.getRow(r);
  ws.mergeCells(`A${r}:F${r}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = "TOTAL";
  totalLabel.font = { ...font, bold: true };
  totalLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  for (let c = 1; c <= 6; c++) totalRow.getCell(c).border = thin;
  const tw = totalRow.getCell(7);
  tw.value = totalWeight;
  tw.numFmt = "#,##0";
  tw.font = { ...font, bold: true };
  tw.alignment = { horizontal: "center", vertical: "middle" };
  tw.border = thin;
  tw.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  const tb = totalRow.getCell(8);
  tb.value = totalBags;
  tb.font = { ...font, bold: true };
  tb.alignment = { horizontal: "center", vertical: "middle" };
  tb.border = thin;
  tb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  totalRow.height = 22;
  r += 1;

  // Pied personnalisé visible
  if (tpl.custom_footer && tpl.custom_footer.trim()) {
    ws.getRow(r).height = 6;
    r += 1;
    ws.mergeCells(`A${r}:H${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = tpl.custom_footer;
    c.font = { ...font, size: 9, italic: true, color: { argb: "FF555555" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thin;
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
