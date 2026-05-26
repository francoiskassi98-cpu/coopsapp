import PptxGenJS from "pptxgenjs";

// Thème cacao
const TH = {
  primary: "2C5F2D",      // vert cacao
  primaryDark: "1B3B1C",
  accent: "C9A24C",       // or
  bg: "FFFFFF",
  light: "F4F1EC",
  text: "2A2A2A",
  muted: "6B6B6B",
  alert: "B85042",
  ok: "2E7D32",
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

function header(slide: PptxGenJS.Slide, pptx: PptxGenJS, title: string, subtitle: string, page: number, total: number) {
  slide.background = { color: TH.bg };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: TH.primary } });
  slide.addText(title, { x: 0.4, y: 0.08, w: 9, h: 0.55, fontSize: 20, bold: true, color: "FFFFFF", fontFace: "Calibri" });
  slide.addText(subtitle, { x: 9.4, y: 0.18, w: 3.5, h: 0.35, fontSize: 11, color: "EFEFEF", align: "right" });
  // footer
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: TH.light } });
  slide.addText("COOPS APP — Gestion des chargements cacao", { x: 0.4, y: 7.22, w: 9, h: 0.26, fontSize: 9, color: TH.muted });
  slide.addText(`${page} / ${total}`, { x: 12, y: 7.22, w: 1, h: 0.26, fontSize: 9, color: TH.muted, align: "right" });
}

function coverSlide(pptx: PptxGenJS, title: string, payload: ReportPayload) {
  const s = pptx.addSlide();
  s.background = { color: TH.primaryDark };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 3.0, w: 13.33, h: 0.06, fill: { color: TH.accent } });
  s.addText("COOPS APP", { x: 0.6, y: 0.5, w: 6, h: 0.5, fontSize: 14, bold: true, color: TH.accent, fontFace: "Calibri" });
  s.addText(title, { x: 0.6, y: 1.8, w: 12, h: 1.2, fontSize: 44, bold: true, color: "FFFFFF" });
  s.addText(`Campagne ${payload.campaign}`, { x: 0.6, y: 3.2, w: 12, h: 0.6, fontSize: 22, color: "DDDDDD" });
  const coops = payload.cooperatives.length === 0 ? "Toutes coopératives" : payload.cooperatives.join(" · ");
  s.addText(coops, { x: 0.6, y: 4.0, w: 12, h: 0.6, fontSize: 16, color: TH.accent });
  s.addText(`Généré le ${payload.generatedAt.toLocaleDateString("fr-FR")} à ${payload.generatedAt.toLocaleTimeString("fr-FR")}`, {
    x: 0.6, y: 6.4, w: 12, h: 0.4, fontSize: 12, color: "BBBBBB",
  });
  if (payload.userEmail) {
    s.addText(`Par ${payload.userEmail}`, { x: 0.6, y: 6.8, w: 12, h: 0.4, fontSize: 11, color: "999999" });
  }
}

function kpiSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Résumé exécutif", `Campagne ${payload.campaign}`, page, total);
  const rate = payload.stats.totalPotential > 0 ? (payload.stats.totalDelivered / payload.stats.totalPotential) * 100 : 0;
  const kpis = [
    { label: "Potentiel total", value: `${fr(payload.stats.totalPotential)} kg`, color: TH.primary },
    { label: "Livré", value: `${fr(payload.stats.totalDelivered)} kg`, color: TH.ok },
    { label: "Restant", value: `${fr(payload.stats.remaining)} kg`, color: TH.alert },
    { label: "Chargements", value: `${fr(payload.stats.shipmentCount)}`, color: TH.accent },
  ];
  kpis.forEach((k, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.2, w: 2.9, h: 1.8, fill: { color: TH.light }, line: { color: k.color, width: 1 }, rectRadius: 0.08 });
    s.addText(k.value, { x, y: 1.4, w: 2.9, h: 0.9, fontSize: 26, bold: true, color: k.color, align: "center" });
    s.addText(k.label, { x, y: 2.3, w: 2.9, h: 0.5, fontSize: 12, color: TH.text, align: "center" });
  });
  s.addText(`Taux de réalisation : ${rate.toFixed(1)} %`, {
    x: 0.4, y: 3.3, w: 12.5, h: 0.6, fontSize: 18, bold: true, color: TH.primary, align: "center",
  });
  // Auto commentary
  const lines: string[] = [];
  lines.push(`• ${payload.coopStats.length} coopérative(s) active(s).`);
  lines.push(`• ${fr(payload.stats.producerCount)} producteur(s) référencé(s) dans le registre.`);
  if (rate >= 75) lines.push("• ✅ Campagne en excellente progression.");
  else if (rate >= 50) lines.push("• 🟢 Progression satisfaisante de la campagne.");
  else if (rate >= 25) lines.push("• ⚠ Progression modérée — intensifier les collectes recommandé.");
  else lines.push("• 🛑 Taux de réalisation faible — actions correctives requises.");
  s.addText(lines.join("\n"), { x: 0.6, y: 4.2, w: 12, h: 2.6, fontSize: 14, color: TH.text, lineSpacingMultiple: 1.4 });
}

function monthlySlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Évolution mensuelle des livraisons", `Campagne ${payload.campaign}`, page, total);
  if (payload.monthly.length === 0) {
    s.addText("Aucune donnée mensuelle disponible.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  s.addChart(pptx.ChartType.line, [{
    name: "Livré (kg)",
    labels: payload.monthly.map((m) => m.label),
    values: payload.monthly.map((m) => m.value),
  }], {
    x: 0.5, y: 1.0, w: 12.3, h: 5.9,
    chartColors: [TH.primary],
    showLegend: false,
    showTitle: false,
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
    lineDataSymbol: "circle",
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
    x: 0.5, y: 1.0, w: 6.5, h: 5.9,
    chartColors: [TH.primary, TH.accent, TH.ok, TH.alert, "1565C0", "8E44AD", "E67E22"],
    showLegend: true,
    legendPos: "b",
    showPercent: true,
  });
  const sum = data.reduce((s, d) => s + d.value, 0);
  const rows: any[][] = [[
    { text: "Catégorie", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 11 } },
    { text: "Poids (kg)", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 11, align: "right" } },
    { text: "Part", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 11, align: "right" } },
  ]];
  data.forEach((d, i) => {
    const bg = i % 2 === 0 ? TH.light : TH.bg;
    rows.push([
      { text: d.name, options: { fill: { color: bg }, fontSize: 10 } },
      { text: fr(d.value), options: { fill: { color: bg }, fontSize: 10, align: "right" } },
      { text: sum > 0 ? `${((d.value / sum) * 100).toFixed(1)} %` : "—", options: { fill: { color: bg }, fontSize: 10, align: "right" } },
    ]);
  });
  s.addTable(rows, { x: 7.2, y: 1.0, w: 5.6, colW: [2.6, 1.6, 1.4], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
}

function coopSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Performance par coopérative", `Campagne ${payload.campaign}`, page, total);
  if (payload.coopStats.length === 0) {
    s.addText("Aucune coopérative.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  const rows: any[][] = [[
    { text: "Coopérative", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
    { text: "Potentiel", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Livré", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Restant", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Chargt.", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Taux", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
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
  s.addTable(rows, { x: 0.4, y: 1.0, w: 12.5, colW: [3.5, 1.9, 1.9, 1.9, 1.4, 1.9], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
}

function shipmentsSlide(pptx: PptxGenJS, payload: ReportPayload, page: number, total: number) {
  const s = pptx.addSlide();
  header(s, pptx, "Historique des chargements", `Campagne ${payload.campaign}`, page, total);
  if (payload.shipmentsSample.length === 0) {
    s.addText("Aucun chargement.", { x: 0.6, y: 3, w: 12, h: 0.6, fontSize: 14, color: TH.muted, align: "center" });
    return;
  }
  const rows: any[][] = [[
    { text: "Connaiss.", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
    { text: "Projet", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
    { text: "Partenaire", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
    { text: "Destination", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
    { text: "Poids (kg)", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10, align: "right" } },
    { text: "Date", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", fontSize: 10 } },
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
  s.addTable(rows, { x: 0.3, y: 1.0, w: 12.7, colW: [1.9, 1.8, 2.5, 2.3, 1.8, 2.4], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
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
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.2, w: 2.9, h: 1.6, fill: { color: TH.light }, line: { color: k.color, width: 1 }, rectRadius: 0.08 });
    s.addText(k.value, { x, y: 1.35, w: 2.9, h: 0.9, fontSize: 26, bold: true, color: k.color, align: "center" });
    s.addText(k.label, { x, y: 2.2, w: 2.9, h: 0.4, fontSize: 12, color: TH.text, align: "center" });
  });
  s.addText(`Surface cacao moyenne : ${t.avgArea.toFixed(2)} ha`, {
    x: 0.4, y: 3.1, w: 12.5, h: 0.5, fontSize: 14, bold: true, color: TH.primary, align: "center",
  });
  const gpsRate = t.totalProducers > 0 ? (t.withGps / t.totalProducers) * 100 : 0;
  const cniRate = t.totalProducers > 0 ? ((t.totalProducers - t.withoutCni) / t.totalProducers) * 100 : 0;
  const lines = [
    `• Couverture GPS : ${gpsRate.toFixed(1)} % des producteurs géolocalisés.`,
    `• Conformité CNI : ${cniRate.toFixed(1)} % des producteurs identifiés.`,
    t.withoutGps > 0 ? `⚠ ${fr(t.withoutGps)} producteur(s) à géolocaliser pour conformité EUDR.` : "✅ Tous les producteurs sont géolocalisés.",
    t.withoutCni > 0 ? `⚠ ${fr(t.withoutCni)} producteur(s) sans pièce d'identité enregistrée.` : "✅ Tous les producteurs ont une CNI enregistrée.",
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
  s.addShape(pptx.ShapeType.roundRect, { x: 4.0, y: 1.1, w: 5.3, h: 1.6, fill: { color: status.c }, rectRadius: 0.1 });
  s.addText(`Statut EUDR : ${status.txt}`, { x: 4.0, y: 1.3, w: 5.3, h: 0.6, fontSize: 22, bold: true, color: "FFFFFF", align: "center" });
  s.addText(`Score global : ${eudrScore.toFixed(1)} / 100`, { x: 4.0, y: 2.0, w: 5.3, h: 0.5, fontSize: 14, color: "FFFFFF", align: "center" });

  const rows: any[][] = [
    [{ text: "Indicateur", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF" } },
     { text: "Valeur", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", align: "right" } },
     { text: "Cible", options: { bold: true, fill: { color: TH.primary }, color: "FFFFFF", align: "right" } }],
    [{ text: "Producteurs géolocalisés" }, { text: `${gpsRate.toFixed(1)} %`, options: { align: "right" } }, { text: "100 %", options: { align: "right" } }],
    [{ text: "Producteurs identifiés (CNI)" }, { text: `${cniRate.toFixed(1)} %`, options: { align: "right" } }, { text: "100 %", options: { align: "right" } }],
    [{ text: "Surface moyenne (ha)" }, { text: t.avgArea.toFixed(2), options: { align: "right" } }, { text: "—", options: { align: "right" } }],
    [{ text: "Producteurs à compléter" }, { text: fr(t.withoutGps + t.withoutCni), options: { align: "right" } }, { text: "0", options: { align: "right" } }],
  ];
  s.addTable(rows, { x: 0.5, y: 3.0, w: 12.3, colW: [6.5, 2.9, 2.9], fontSize: 12, border: { type: "solid", pt: 0.5, color: "CCCCCC" } });

  const risks: string[] = [];
  if (gpsRate < 100) risks.push(`• Risque EUDR : ${fr(t.withoutGps)} parcelle(s) sans coordonnées GPS.`);
  if (t.withoutCni > 0) risks.push(`• Risque traçabilité : ${fr(t.withoutCni)} producteur(s) non identifié(s).`);
  if (risks.length === 0) risks.push("• ✅ Aucun risque majeur détecté.");
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
    x: 0.5, y: 1.0, w: 12.3, h: 5.9,
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
    `• Coopératives actives : ${payload.coopStats.length}`,
    `• Producteurs référencés : ${fr(payload.stats.producerCount)}`,
    "",
    rate >= 75
      ? `✅ La campagne ${payload.campaign} affiche une excellente progression (${rate.toFixed(1)} %).`
      : rate >= 50
      ? `🟢 La campagne ${payload.campaign} progresse de manière satisfaisante (${rate.toFixed(1)} %).`
      : `⚠ La campagne ${payload.campaign} nécessite une intensification des collectes (${rate.toFixed(1)} %).`,
  ];
  s.addText(lines.join("\n"), { x: 0.8, y: 2.9, w: 11.7, h: 4, fontSize: 16, color: "EFEFEF", lineSpacingMultiple: 1.5 });
  s.addText(`${page} / ${total}`, { x: 12, y: 7.0, w: 1, h: 0.3, fontSize: 9, color: "AAAAAA", align: "right" });
}

function buildSlides(pptx: PptxGenJS, type: ReportType, payload: ReportPayload) {
  const titles: Record<ReportType, string> = {
    campaign: "Rapport de campagne",
    cooperative: "Rapport coopératives",
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
