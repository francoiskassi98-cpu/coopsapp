import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

/**
 * Génère une "FICHE D'ACCOMPAGNEMENT CAMPAGNE" reproduisant fidèlement
 * la mise en page du modèle officiel (FICHIER EXEMPLE.xlsx).
 */
export async function generateShipmentFiche(shipmentId: string): Promise<void> {
  const { data: shipment, error: sErr } = await supabase
    .from("shipments")
    .select(
      "id, connaissement, lot_number, project, destination, total_weight, total_bags, delivery_start, cooperative_id, partner_id, cooperatives(name), partners(name)"
    )
    .eq("id", shipmentId)
    .maybeSingle();
  if (sErr || !shipment) throw new Error("Chargement introuvable");

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
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      printTitlesRow: "13:13",
    },
  });

  // Column widths (A..H) calqués sur le modèle
  const widths = [6, 32, 18, 18, 22, 24, 16, 12];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const thin: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const font = { name: "Calibri" };

  // ===== Titre (ligne 1) =====
  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = "FICHE D'ACCOMPAGNEMENT CAMPAGNE";
  title.font = { ...font, bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  title.border = thin;
  ws.getRow(1).height = 34;

  // Helper pour les lignes d'info
  const setInfo = (
    row: number,
    label: string,
    value: string | number | Date,
    rightLabel?: string,
    rightValue?: string | number | Date
  ) => {
    const a = ws.getCell(`A${row}`);
    a.value = label;
    a.font = { ...font, bold: true };
    a.alignment = { vertical: "middle" };
    a.border = thin;
    ws.mergeCells(`B${row}:C${row}`);
    const c = ws.getCell(`B${row}`);
    c.value = value as any;
    c.font = { ...font };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.border = thin;
    ws.getCell(`C${row}`).border = thin;
    // Cellules D-E vides bordées
    ws.mergeCells(`D${row}:E${row}`);
    ws.getCell(`D${row}`).border = thin;
    ws.getCell(`E${row}`).border = thin;
    if (rightLabel !== undefined) {
      const f = ws.getCell(`F${row}`);
      f.value = rightLabel;
      f.font = { ...font, bold: true };
      f.alignment = { vertical: "middle", horizontal: "left" };
      f.border = thin;
    } else {
      ws.getCell(`F${row}`).border = thin;
    }
    ws.mergeCells(`G${row}:H${row}`);
    const g = ws.getCell(`G${row}`);
    if (rightValue !== undefined) {
      g.value = rightValue as any;
      g.font = { ...font };
      g.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    g.border = thin;
    ws.getCell(`H${row}`).border = thin;
    ws.getRow(row).height = 20;
  };

  const coopName = (shipment as any).cooperatives?.name || "—";
  const partnerName = (shipment as any).partners?.name || "—";
  const dateDepart = shipment.delivery_start ? new Date(shipment.delivery_start) : "—";

  setInfo(2, "Fournisseur :", coopName, "Statut", "");
  setInfo(3, "Nom du Chauffeur :", "—", undefined, (shipment.project || "").toUpperCase());
  setInfo(4, "N° du Camion :", "—");
  setInfo(5, "N° de Remorque :", "—", "N° de connaissement", "");
  setInfo(6, "", "", undefined, shipment.connaissement || "—");
  setInfo(7, "N° de lot", shipment.lot_number || "—");
  setInfo(8, "Poids total :", Number(shipment.total_weight) || 0, "Destination", "");
  setInfo(9, "Nombre de producteurs", uniqueProducers, undefined, shipment.destination || "—");
  setInfo(10, "Nombre de sacs déclarés :", Number(shipment.total_bags) || 0, "PARTENAIRE", "");
  setInfo(11, "Date départ :", dateDepart as any, undefined, partnerName);

  // Format date
  ws.getCell("B11").numFmt = "dd/mm/yyyy";
  ws.getCell("B8").numFmt = "#,##0";
  ws.getCell("B10").numFmt = "#,##0";

  // ===== Ligne séparation (12) =====
  ws.getRow(12).height = 6;

  // ===== En-tête tableau (13) =====
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
  const headerRow = ws.getRow(13);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2E7D32" },
    };
    cell.border = thin;
  });
  headerRow.height = 36;

  // ===== Lignes de livraisons =====
  rows.forEach((d: any, idx: number) => {
    const r = ws.getRow(14 + idx);
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
      const cell = r.getCell(i + 1);
      cell.value = v as any;
      cell.font = { ...font };
      cell.border = thin;
      cell.alignment = {
        vertical: "middle",
        horizontal: i === 1 || i === 4 ? "left" : "center",
        indent: i === 1 ? 1 : 0,
      };
    });
    r.getCell(6).numFmt = "dd/mm/yyyy";
    r.getCell(7).numFmt = "#,##0";
    r.height = 18;
  });

  // ===== Ligne totaux =====
  const totalRowIdx = 14 + rows.length;
  const totalWeight = rows.reduce((s: number, d: any) => s + (Number(d.net_weight) || 0), 0);
  const totalBags = rows.reduce((s: number, d: any) => s + (Number(d.num_bags) || 0), 0);
  const totalRow = ws.getRow(totalRowIdx);
  ws.mergeCells(`A${totalRowIdx}:F${totalRowIdx}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = "TOTAL";
  totalLabel.font = { ...font, bold: true };
  totalLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  totalLabel.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  for (let c = 1; c <= 6; c++) totalRow.getCell(c).border = thin;
  const tw = totalRow.getCell(7);
  tw.value = totalWeight;
  tw.numFmt = "#,##0";
  tw.font = { ...font, bold: true };
  tw.alignment = { horizontal: "center", vertical: "middle" };
  tw.border = thin;
  tw.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  const tb = totalRow.getCell(8);
  tb.value = totalBags;
  tb.font = { ...font, bold: true };
  tb.alignment = { horizontal: "center", vertical: "middle" };
  tb.border = thin;
  tb.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" },
  };
  totalRow.height = 22;

  // ===== Téléchargement =====
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeCoop = (coopName || "Coop").replace(/[^a-z0-9-]+/gi, "_");
  const safeLot = (shipment.lot_number || shipment.connaissement || shipment.id.slice(0, 6)).replace(
    /[^a-z0-9-]+/gi,
    "_"
  );
  a.href = url;
  a.download = `Fiche-Accompagnement-${safeCoop}-${safeLot}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
