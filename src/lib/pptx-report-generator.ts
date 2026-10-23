import PptxGenJS from "pptxgenjs";

// Thème « Financial Elite » cacao : vert profond, or, ivoire
const TH = {
  primary: "1F4D3A",
  primaryDark: "10291F",
  accent: "C9A24C",
  bg: "FFFFFF",
  light: "F5F1E8",
  text: "2A2A2A",
  muted: "7A7468",
  alert: "B85042",
  ok: "3C7A55",
};

export type ReportType = "campaign" | "cooperative" | "shipments" | "tracability" | "eudr";

export interface ReportPayload {
  type: ReportType;
  campaign: string;
  cooperatives: string[];
  userEmail: string | null;
  generatedAt: Date;
  stats: {
    totalPotential: number;
    totalDelivered: number;
    remaining: number;
    shipmentCount: number;
    producerCount: number;
  };
  coopStats: Array<{ name: string; potentiel: number; delivered: number; remaining: number; shipmentCount: number }>;
  byProject: Array<{ name: string; value: number }>;
  byDestination: Array<{ name: string; value: number }>;
  byPartner: Array<{ name: string; value: number }>;
  monthly: Array<{ label: string; value: number }>;
  topSections: Array<{ name: string; cooperative: string; potentiel: number }>;
  shipmentsSample: Array<{ connaissement: string; project: string; partner: string; destination: string; weight: number; date: string }>;
  tracability: {
    totalProducers: number;
    withGps: number;
    withoutGps: number;
    withoutCni: number;
    avgArea: number;
  };
}

const fr = (n: number) => Math.round(Number(n) || 0).toLocaleString("fr-FR");

const FONT_TITLE = "Georgia";
const FONT_BODY = "Calibri";

// En-tête éditorial : fond clair, filet or, titre serif — style keynote sobre
function header(slide: PptxGenJS.Slide, pptx: PptxGenJS, title: string, subtitle: string, page: number, total: number) {
  slide.background = { color: TH.bg };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: TH.primary } });
  slide.addText(subtitle.toUpperCase(), { x: 0.6, y: 0.3, w: 8, h: 0.3, fontSize: 10, bold: true, color: TH.accent, fontFace: FONT_BODY, charSpacing: 3 });
  slide.addText(title, { x: 0.6, y: 0.55, w: 12, h: 0.6, fontSize: 26, bold: true, color: TH.primaryDark, fontFace: FONT_TITLE });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.18, w: 0.9, h: 0.05, fill: { color: TH.accent } });
  slide.addText("COOPS APP", { x: 0.6, y: 7.05, w: 6, h: 0.3, fontSize: 9, bold: true, color: TH.muted, fontFace: FONT_BODY, charSpacing: 2 });
  slide.addText(`${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { x: 11.5, y: 7.05, w: 1.4, h: 0.3, fontSize: 9, color: TH.muted, align: "right", fontFace: FONT_BODY });
}

function coverSlide(pptx: PptxGenJS, title: string, payload: ReportPayload) {
  const s = pptx.addSlide();
  s.background = { color: TH.primaryDark };
  s.addShape(pptx.ShapeType.rect, { x: 8.9, y: 0, w: 4.43, h: 7.5, fill: { color: TH.primary } });
  s.addShape(pptx.ShapeType.ellipse, { x: 9.6, y: 1.6, w: 3.0, h: 3.0, fill: { color: TH.accent, transparency: 75 }, line: { color: TH.accent, width: 1 } });
  s.addText(payload.campaign, { x: 8.9, y: 2.6, w: 4.43, h: 1, fontSize: 30, bold: true, color: "FFFFFF", align: "center", fontFace: FONT_TITLE });
  s.addText("CAMPAGNE", { x: 8.9, y: 2.2, w: 4.43, h: 0.4, fontSize: 11, color: TH.accent, align: "center", bold: true, charSpacing: 4, fontFace: FONT_BODY });
  s.addText("COOPS APP", { x: 0.7, y: 0.6, w: 6, h: 0.4, fontSize: 12, bold: true, color: TH.accent, fontFace: FONT_BODY, charSpacing: 4 });
  s.addText(title, { x: 0.7, y: 2.0, w: 7.8, h: 1.8, fontSize: 48, bold: true, color: "FFFFFF", fontFace: FONT_TITLE, valign: "top" });
  s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 3.95, w: 1.2, h: 0.06, fill: { color: TH.accent } });
  const coops = payload.cooperatives.length === 0 ? "Tous les registres" : payload.cooperatives.join(" · ");
  s.addText(coops, { x: 0.7, y: 4.2, w: 7.8, h: 0.8, fontSize: 16, color: "E8E2D4", fontFace: FONT_BODY, valign: "top" });
  s.addText(`Généré le ${payload.generatedAt.toLocaleDateString("fr-FR")} à ${payload.generatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${payload.userEmail ? `  ·  ${payload.userEmail}` : ""}`, {
    x: 0.7, y: 6.6, w: 7.8, h: 0.4, fontSize: 11, color: "A8B5A8", fontFace: FONT_BODY,
  });
}

function kpiSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Résumé exécutif", `Campagne ${payload.campaign}`, page, total);
  const rate = payload.stats.totalPotential > 0 ? (payload.stats.totalDelivered / payload.stats.totalPotential) * 100 : 0;
  // Chiffre clé héros
  s.addText(`${rate.toFixed(1)} %`, { x: 0.6, y: 1.6, w: 4.6, h: 1.6, fontSize: 72, bold: true, color: TH.primary, fontFace: FONT_TITLE });
  s.addText("Taux de réalisation de la campagne", { x: 0.6, y: 3.15, w: 4.6, h: 0.4, fontSize: 13, color: TH.muted, fontFace: FONT_BODY });
  // Barre de progression
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 3.7, w: 4.4, h: 0.22, fill: { color: TH.light }, rectRadius: 0.11 });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 3.7, w: Math.max(0.22, 4.4 * Math.min(rate, 100) / 100), h: 0.22, fill: { color: TH.accent }, rectRadius: 0.11 });

  const kpis = [
    { label: "Potentiel total", value: `${fr(payload.stats.totalPotential)} kg`, color: TH.primary },
    { label: "Volume livré", value: `${fr(payload.stats.totalDelivered)} kg`, color: TH.ok },
    { label: "Restant à livrer", value: `${fr(payload.stats.remaining)} kg`, color: TH.alert },
    { label: "Chargements", value: `${fr(payload.stats.shipmentCount)}`, color: TH.accent },
  ];
  kpis.forEach((k, i) => {
    const x = 5.8 + (i % 2) * 3.6;
    const y = 1.6 + Math.floor(i / 2) * 1.75;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 3.4, h: 1.55, fill: { color: TH.light }, line: { color: TH.light } });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h: 1.55, fill: { color: k.color } });
    s.addText(k.label.toUpperCase(), { x: x + 0.3, y: y + 0.2, w: 3, h: 0.3, fontSize: 9, bold: true, color: TH.muted, charSpacing: 2, fontFace: FONT_BODY });
    s.addText(k.value, { x: x + 0.3, y: y + 0.55, w: 3, h: 0.8, fontSize: 24, bold: true, color: TH.primaryDark, fontFace: FONT_TITLE });
  });

  let verdict: string;
  if (rate >= 75) verdict = "Campagne en excellente progression.";
  else if (rate >= 50) verdict = "Progression satisfaisante de la campagne.";
  else if (rate >= 25) verdict = "Progression modérée — intensifier les collectes.";
  else verdict = "Taux de réalisation faible — actions correctives requises.";
  s.addText([
    { text: "À retenir  ", options: { bold: true, color: TH.accent } },
    { text: `${verdict}  ${payload.coopStats.length} registre(s) actif(s) · ${fr(payload.stats.producerCount)} producteur(s) référencé(s).`, options: { color: TH.text } },
  ], { x: 0.6, y: 5.4, w: 12.2, h: 0.9, fontSize: 14, fontFace: FONT_BODY, valign: "middle" });
}

function monthlySlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Histogramme des chargements par mois", `Campagne ${payload.campaign}`, page, total);
  if (payload.monthly.length === 0) {
    s.addText("Aucune donnée mensuelle disponible.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  s.addChart(pptx.ChartType.bar, [{
    name: "Livré (kg)",
    labels: payload.monthly.map((m) => m.label),
    values: payload.monthly.map((m) => m.value),
  }], {
    x: 0.5, y: 1.5, w: 12.3, h: 5.3,
    chartColors: [TH.primary],
    showLegend: false,
    showTitle: false,
    barDir: "col",
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
  });
}

function distributionSlide(pptx: PptxGenJS, title: string, data: Array<{ name: string; value: number }>, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, title, `Campagne ${payload.campaign}`, page, total);
  if (data.length === 0) {
    s.addText("Aucune donnée.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  s.addChart(pptx.ChartType.doughnut, [{
    name: title,
    labels: data.map((d) => d.name),
    values: data.map((d) => d.value),
  }], {
    x: 0.5, y: 1.5, w: 6.5, h: 5.3,
    chartColors: [TH.primary, TH.accent, TH.ok, TH.alert, "1565C0", "8E44AD", "E67E22"],
    showLegend: true,
    legendPos: "b",
    showPercent: true,
  });
  const sum = data.reduce((s, d) => s + d.value, 0);
  const rows: PptxGenJS.TableRow[] = [[
    { text: "Catégorie", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 11 } },
    { text: "Poids (kg)", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 11, align: "right" } },
    { text: "Part", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 11, align: "right" } },
  ]];
  data.forEach((d, i) => {
    const bg = i % 2 === 0 ? TH.light : TH.bg;
    rows.push([
      { text: d.name, options: { fill: { color: bg }, fontSize: 10 } },
      { text: fr(d.value), options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: sum > 0 ? `${((d.value / sum) * 100).toFixed(1)} %` : "—", options: { fill: { color: bg }, fontSize: 10, align: "right" } },
    ]);
  });
  s.addTable(rows, { x: 7.2, y: 1.5, w: 5.6, colW: [2.6, 1.6, 1.4], border: { type: "solid", pt: 0.5, color: "E4DED2" } });
}

function coopSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Performance par registre", `Campagne ${payload.campaign}`, page, total);
  if (payload.coopStats.length === 0) {
    s.addText("Aucun registre.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  const rows: PptxGenJS.TableRow[] = [[
    { text: "Registre", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
    { text: "Potentiel", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Livré", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Restant", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Chargt.", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Taux", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
  ]];
  payload.coopStats.slice(0, 14).forEach((c, i) => {
    const bg = i % 2 === 0 ? TH.light : TH.bg;
    const taux = c.potentiel > 0 ? `${((c.delivered / c.potentiel) * 100).toFixed(1)} %` : "—";
    rows.push([
      { text: c.name, options: { fill: { color: bg }, fontSize: 10 } },
      { text: fr(c.potentiel), options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: fr(c.delivered), options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: fr(c.remaining), options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: `${c.shipmentCount}`, options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: taux, options: { fill: { color: bg }, fontSize: 10, align: "right" } },
    ]);
  });
  s.addTable(rows, { x: 0.4, y: 1.5, w: 12.5, colW: [3.5, 1.9, 1.9, 1.9, 1.4, 1.9], border: { type: "solid", pt: 0.5, color: "E4DED2" } });
}

function shipmentsSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Historique des chargements", `Campagne ${payload.campaign}`, page, total);
  if (payload.shipmentsSample.length === 0) {
    s.addText("Aucun chargement.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  const rows: PptxGenJS.TableRow[] = [[
    { text: "Connaiss.", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
    { text: "Projet", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
    { text: "Partenaire", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
    { text: "Destination", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
    { text: "Poids (kg)", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Date", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", fontSize: 10 } },
  ]];
  payload.shipmentsSample.slice(0, 18).forEach((sh, i) => {
    const bg = i % 2 === 0 ? TH.light : TH.bg;
    rows.push([
      { text: sh.connaissement || "—", options: { fill: { color: bg }, fontSize: 9 } },
      { text: sh.project, options: { fill: { color: bg }, fontSize: 9 } },
      { text: sh.partner, options: { fill: { color: bg }, fontSize: 9 } },
      { text: sh.destination, options: { fill: { color: bg }, fontSize: 9 } },
      { text: fr(sh.weight), options: { fill: { color: bg }, fontSize: 9, align: "right" } },
      { text: sh.date, options: { fill: { color: bg }, fontSize: 9 } },
    ]);
  });
  s.addTable(rows, { x: 0.3, y: 1.5, w: 12.7, colW: [1.9, 1.8, 2.5, 2.3, 1.8, 2.4], border: { type: "solid", pt: 0.5, color: "E4DED2" } });
}

function tracabilitySlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Traçabilité — Conformité du registre", `Campagne ${payload.campaign}`, page, total);
  const t = payload.tracability;
  const kpis = [
    { label: "Producteurs", value: `${fr(t.totalProducers)}`, color: TH.primary },
    { label: "Avec GPS", value: `${fr(t.withGps)}`, color: TH.ok },
    { label: "Sans GPS", value: `${fr(t.withoutGps)}`, color: TH.alert },
    { label: "Sans CNI", value: `${fr(t.withoutCni)}`, color: TH.accent },
  ];
  kpis.forEach((k, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 2.9, h: 1.6, fill: { color: TH.light }, line: { color: k.color, width: 1 }, rectRadius: 0.08 });
    s.addText(k.value, { x, y: 1.75, w: 2.9, h: 0.9, fontSize: 26, bold: true, color: k.color, align: "center" });
    s.addText(k.label, { x, y: 2.6, w: 2.9, h: 0.4, fontSize: 12, color: TH.text, align: "center" });
  });
  s.addText(`Surface cacao moyenne : ${t.avgArea.toFixed(2)} ha`, {
    x: 0.4, y: 3.1, w: 12.5, h: 0.5, fontSize: 14, bold: true, color: TH.primary, align: "center",
  });
  const gpsRate = t.totalProducers > 0 ? (t.withGps / t.totalProducers) * 100 : 0;
  const cniRate = t.totalProducers > 0 ? ((t.totalProducers - t.withoutCni) / t.totalProducers) * 100 : 0;
  const lines = [
    `• Couverture GPS : ${gpsRate.toFixed(1)} % des producteurs géolocalisés.`,
    `• Conformité CNI : ${cniRate.toFixed(1)} % des producteurs identifiés.`,
    t.withoutGps > 0 ? `${fr(t.withoutGps)} producteur(s) à géolocaliser pour conformité EUDR.` : "Tous les producteurs sont géolocalisés.",
    t.withoutCni > 0 ? `${fr(t.withoutCni)} producteur(s) sans pièce d'identité enregistrée.` : "Tous les producteurs ont une CNI enregistrée.",
  ];
  s.addText(lines.join("\n"), { x: 0.6, y: 3.9, w: 12, h: 3, fontSize: 13, color: TH.text, lineSpacingMultiple: 1.4 });
}

function eudrSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Conformité EUDR / Durabilité", `Campagne ${payload.campaign}`, page, total);
  const t = payload.tracability;
  const gpsRate = t.totalProducers > 0 ? (t.withGps / t.totalProducers) * 100 : 0;
  const cniRate = t.totalProducers > 0 ? ((t.totalProducers - t.withoutCni) / t.totalProducers) * 100 : 0;
  const eudrScore = (gpsRate * 0.6 + cniRate * 0.4);
  const status = eudrScore >= 90 ? { txt: "CONFORME", c: TH.ok } : eudrScore >= 70 ? { txt: "ATTENTION", c: TH.accent } : { txt: "NON CONFORME", c: TH.alert };
  s.addShape(pptx.ShapeType.roundRect, { x: 4.0, y: 1.45, w: 5.3, h: 1.6, fill: { color: status.c }, rectRadius: 0.1 });
  s.addText(`Statut EUDR : ${status.txt}`, { x: 4.0, y: 1.6, w: 5.3, h: 0.6, fontSize: 22, bold: true, color: "FFFFFF", align: "center" });
  s.addText(`Score global : ${eudrScore.toFixed(1)} / 100`, { x: 4.0, y: 2.3, w: 5.3, h: 0.5, fontSize: 14, color: "FFFFFF", align: "center" });

  const rows: PptxGenJS.TableRow[] = [
    [{ text: "Indicateur", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF" } },
     { text: "Valeur", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", align: "right" } },
     { text: "Cible", options: { bold: true, fill: { color: TH.primaryDark }, color: "FFFFFF", align: "right" } }],
    [{ text: "Producteurs géolocalisés" }, { text: `${gpsRate.toFixed(1)} %`, options: { align: "right" } }, { text: "100 %", options: { align: "right" } }],
    [{ text: "Producteurs identifiés (CNI)" }, { text: `${cniRate.toFixed(1)} %`, options: { align: "right" } }, { text: "100 %", options: { align: "right" } }],
    [{ text: "Surface moyenne (ha)" }, { text: t.avgArea.toFixed(2), options: { align: "right" } }, { text: "—", options: { align: "right" } }],
    [{ text: "Producteurs à compléter" }, { text: fr(t.withoutGps + t.withoutCni), options: { align: "right" } }, { text: "0", options: { align: "right" } }],
  ];
  s.addTable(rows, { x: 0.5, y: 3.0, w: 12.3, colW: [6.5, 2.9, 2.9], fontSize: 12, border: { type: "solid", pt: 0.5, color: "E4DED2" } });

  const risks: string[] = [];
  if (gpsRate < 100) risks.push(`• Risque EUDR : ${fr(t.withoutGps)} parcelle(s) sans coordonnées GPS.`);
  if (t.withoutCni > 0) risks.push(`• Risque traçabilité : ${fr(t.withoutCni)} producteur(s) non identifié(s).`);
  if (risks.length === 0) risks.push("• Aucun risque majeur détecté.");
  s.addText(risks.join("\n"), { x: 0.6, y: 6.0, w: 12, h: 1.0, fontSize: 12, color: TH.text, lineSpacingMultiple: 1.3 });
}

function sectionsSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Top sections par potentiel", `Campagne ${payload.campaign}`, page, total);
  if (payload.topSections.length === 0) {
    s.addText("Aucune section.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  const data = payload.topSections.slice(0, 10);
  s.addChart(pptx.ChartType.bar, [{
    name: "Potentiel (kg)",
    labels: data.map((d) => `${d.name} — ${d.cooperative}`),
    values: data.map((d) => d.potentiel),
  }], {
    x: 0.5, y: 1.5, w: 12.3, h: 5.3,
    chartColors: [TH.primary],
    showLegend: false,
    barDir: "bar",
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
  });
}

function conclusionSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  s.background = { color: TH.primaryDark };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 2.5, w: 13.33, h: 0.05, fill: { color: TH.accent } });
  s.addText("Synthèse & recommandations", { x: 0.6, y: 0.6, w: 12, h: 0.8, fontSize: 32, bold: true, color: "FFFFFF" });
  s.addText(`Campagne ${payload.campaign}`, { x: 0.6, y: 1.5, w: 12, h: 0.5, fontSize: 16, color: TH.accent });

  const rate = payload.stats.totalPotential > 0 ? (payload.stats.totalDelivered / payload.stats.totalPotential) * 100 : 0;
  const lines = [
    `• Potentiel total : ${fr(payload.stats.totalPotential)} kg`,
    `• Volume livré : ${fr(payload.stats.totalDelivered)} kg (${rate.toFixed(1)} %)`,
    `• Volume restant : ${fr(payload.stats.remaining)} kg`,
    `• Chargements réalisés : ${fr(payload.stats.shipmentCount)}`,
    `• Registres actives : ${payload.coopStats.length}`,
    `• Producteurs référencés : ${fr(payload.stats.producerCount)}`,
    "",
    rate >= 75
      ? `La campagne ${payload.campaign} affiche une excellente progression (${rate.toFixed(1)} %).`
      : rate >= 50
      ? `La campagne ${payload.campaign} progresse de manière satisfaisante (${rate.toFixed(1)} %).`
      : `La campagne ${payload.campaign} nécessite une intensification des collectes (${rate.toFixed(1)} %).`,
  ];
  s.addText(lines.join("\n"), { x: 0.8, y: 2.9, w: 11.7, h: 4, fontSize: 16, color: "EFEFEF", lineSpacingMultiple: 1.5 });
  s.addText(`${page} / ${total}`, { x: 12, y: 7.0, w: 1, h: 0.3, fontSize: 9, color: "AAAAAA", align: "right" });
}

function buildSlides(pptx: PptxGenJS, type: ReportType, payload: ReportPayload) {
  const titles: Record<ReportType, string> = {
    campaign: "Rapport de campagne",
    cooperative: "Rapport registres",
    shipments: "Rapport chargements",
    tracability: "Rapport traçabilité",
    eudr: "Rapport EUDR / Durabilité",
  };

  // build slide list
  const builders: Array<(p: number, t: number) => void> = [];
  builders.push((p, t) => coverSlide(pptx, titles[type], payload));

  if (type === "campaign") {
    builders.push((p, t) => kpiSlide(pptx, payload, p, t));
    builders.push((p, t) => monthlySlide(pptx, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par projet", payload.byProject, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par destination", payload.byDestination, payload, p, t));
    builders.push((p, t) => coopSlide(pptx, payload, p, t));
    builders.push((p, t) => conclusionSlide(pptx, payload, p, t));
  } else if (type === "cooperative") {
    builders.push((p, t) => kpiSlide(pptx, payload, p, t));
    builders.push((p, t) => coopSlide(pptx, payload, p, t));
    builders.push((p, t) => sectionsSlide(pptx, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par projet", payload.byProject, payload, p, t));
    builders.push((p, t) => conclusionSlide(pptx, payload, p, t));
  } else if (type === "shipments") {
    builders.push((p, t) => kpiSlide(pptx, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par destination", payload.byDestination, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par partenaire", payload.byPartner, payload, p, t));
    builders.push((p, t) => distributionSlide(pptx, "Répartition par projet", payload.byProject, payload, p, t));
    builders.push((p, t) => shipmentsSlide(pptx, payload, p, t));
    builders.push((p, t) => conclusionSlide(pptx, payload, p, t));
  } else if (type === "tracability") {
    builders.push((p, t) => tracabilitySlide(pptx, payload, p, t));
    builders.push((p, t) => sectionsSlide(pptx, payload, p, t));
    builders.push((p, t) => coopSlide(pptx, payload, p, t));
    builders.push((p, t) => conclusionSlide(pptx, payload, p, t));
  } else {
    // eudr
    builders.push((p, t) => tracabilitySlide(pptx, payload, p, t));
    builders.push((p, t) => eudrSlide(pptx, payload, p, t));
    builders.push((p, t) => coopSlide(pptx, payload, p, t));
    builders.push((p, t) => conclusionSlide(pptx, payload, p, t));
  }

  const total = builders.length;
  builders.forEach((b, i) => b(i + 1, total));
}

export async function generateReport(type: ReportType, payload: ReportPayload): Promise<{ fileName: string }> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "COOPS APP";
  pptx.title = `Rapport ${type} — ${payload.campaign}`;
  buildSlides(pptx, type, payload);
  const suffix = type.charAt(0).toUpperCase() + type.slice(1);
  const fileName = `Rapport_${suffix}_${payload.campaign}_${payload.generatedAt.toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName });
  return { fileName };
}
