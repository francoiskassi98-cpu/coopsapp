import PptxGenJS from "pptxgenjs";
import type { ReportPayload } from "@/hooks/useReportData";
import type { CategoryMetric } from "@/lib/report-metrics";

export type { ReportPayload };

// Identité filière cacao : vert forêt dominant, vert naturel, ivoire, or, terracotta pour les alertes
const TH = {
  forest: "1E3A2B",
  forestDark: "12261B",
  leaf: "5E8C4A",
  leafLight: "A9C79A",
  ivory: "F8F6F0",
  sand: "ECE6D6",
  gold: "C89D46",
  alert: "B85042",
  text: "23302A",
  muted: "6E7568",
  white: "FFFFFF",
};
const FT = "Georgia";
const FB = "Calibri";
const W = 13.33;

const kg = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} kg`;
const t = (v: number) => `${(v / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;
const int = (v: number) => Math.round(v).toLocaleString("fr-FR");
const pct = (v: number | null, d = 1) => (v === null ? "Non calculable" : `${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} %`);
const optKg = (v: number | null) => (v === null ? "Non calculable" : kg(v));
const fmtDate = (s: string) => new Date(s).toLocaleDateString("fr-FR");
const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Slide = PptxGenJS.Slide;

class Deck {
  pptx = new PptxGenJS();
  page = 0;
  constructor(public p: ReportPayload) {
    this.pptx.layout = "LAYOUT_WIDE";
    this.pptx.title = `Rapport de campagne ${p.campaign}`;
    this.pptx.company = "COOPS APP";
  }

  content(eyebrow: string, title: string): Slide {
    this.page += 1;
    const s = this.pptx.addSlide();
    s.background = { color: TH.ivory };
    s.addShape(this.pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: TH.forest }, line: { color: TH.forest } });
    s.addText(eyebrow.toUpperCase(), { x: 0.6, y: 0.3, w: 10, h: 0.3, fontSize: 11, bold: true, color: TH.gold, fontFace: FB, charSpacing: 3, margin: 0 });
    s.addText(title, { x: 0.6, y: 0.6, w: 12.2, h: 0.7, fontSize: 30, bold: true, color: TH.forestDark, fontFace: FT, margin: 0 });
    s.addText(`COOPS APP  ·  ${this.p.cooperativeName}  ·  Campagne ${this.p.campaign}  ·  ${this.p.scopeLabel}`, { x: 0.6, y: 7.05, w: 10.5, h: 0.3, fontSize: 9, color: TH.muted, fontFace: FB, margin: 0 });
    s.addText(String(this.page).padStart(2, "0"), { x: 11.9, y: 7.0, w: 0.9, h: 0.35, fontSize: 12, bold: true, color: TH.forest, align: "right", fontFace: FT, margin: 0 });
    return s;
  }

  kpi(s: Slide, x: number, y: number, w: number, label: string, value: string, sub: string, accent = TH.leaf) {
    s.addShape(this.pptx.ShapeType.rect, { x, y, w, h: 1.3, fill: { color: TH.white }, line: { color: TH.sand, width: 0.75 } });
    s.addShape(this.pptx.ShapeType.rect, { x, y, w: 0.07, h: 1.3, fill: { color: accent }, line: { color: accent } });
    s.addText(label.toUpperCase(), { x: x + 0.22, y: y + 0.12, w: w - 0.3, h: 0.28, fontSize: 9, bold: true, color: TH.muted, fontFace: FB, charSpacing: 1.5, margin: 0 });
    s.addText(value, { x: x + 0.22, y: y + 0.42, w: w - 0.3, h: 0.5, fontSize: 20, bold: true, color: TH.forestDark, fontFace: FT, margin: 0, fit: "shrink" });
    s.addText(sub, { x: x + 0.22, y: y + 0.92, w: w - 0.3, h: 0.3, fontSize: 10, color: TH.muted, fontFace: FB, margin: 0 });
  }

  table(s: Slide, head: string[], rows: string[][], x: number, y: number, w: number, colW: number[], fontSize = 10, maxH?: number) {
    const hdr = head.map((h) => ({ text: h, options: { bold: true, color: TH.white, fill: { color: TH.forest }, fontSize, fontFace: FB } }));
    const body = rows.map((r, i) => r.map((c, j) => ({
      text: c, options: { color: TH.text, fontSize, fontFace: FB, fill: { color: i % 2 ? TH.ivory : TH.white }, align: (j === 0 ? "left" : "right") as "left" | "right" },
    })));
    s.addTable([hdr, ...body], { x, y, w, colW, border: { type: "solid", pt: 0.5, color: TH.sand }, rowH: 0.3, margin: 0.05, autoPage: false, ...(maxH ? { h: maxH } : {}) });
  }

  empty(s: Slide, msg: string, y = 3.2) {
    s.addText(msg, { x: 0.6, y, w: 12.2, h: 0.6, fontSize: 16, italic: true, color: TH.muted, align: "center", fontFace: FB });
  }

  note(s: Slide, label: string, text: string, y = 6.25, h = 0.65) {
    s.addShape(this.pptx.ShapeType.rect, { x: 0.6, y, w: 12.2, h, fill: { color: TH.sand }, line: { color: TH.sand } });
    s.addText([
      { text: `${label}  `, options: { bold: true, color: TH.forest } },
      { text, options: { color: TH.text } },
    ], { x: 0.8, y, w: 11.8, h, fontSize: 12, fontFace: FB, valign: "middle", margin: 0 });
  }

  bars(s: Slide, labels: string[], series: Array<{ name: string; values: number[] }>, opts: { x: number; y: number; w: number; h: number; dir?: "bar" | "col"; colors?: string[]; title?: string; stacked?: boolean; legend?: boolean }) {
    s.addChart(this.pptx.ChartType.bar, series.map((se) => ({ name: se.name, labels, values: se.values })), {
      x: opts.x, y: opts.y, w: opts.w, h: opts.h, barDir: opts.dir ?? "col",
      barGrouping: opts.stacked ? "stacked" : "clustered",
      chartColors: opts.colors ?? [TH.forest, TH.leafLight, TH.gold],
      showLegend: opts.legend ?? series.length > 1, legendPos: "b", legendFontSize: 10,
      showTitle: !!opts.title, title: opts.title, titleFontSize: 12, titleColor: TH.forestDark, titleFontFace: FB,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelColor: TH.muted, valAxisLabelColor: TH.muted,
      valGridLine: { color: "E3DED0", style: "solid", size: 0.5 }, catGridLine: { style: "none" },
      valAxisLabelFormatCode: "#,##0", dataLabelFontSize: 8,
    });
  }
}

/* ---------------------------------------------------------------- diapositives */

function cover(d: Deck) {
  const { p, pptx } = d;
  d.page += 1;
  const s = pptx.addSlide();
  s.background = { color: TH.forestDark };
  s.addShape(pptx.ShapeType.rect, { x: 8.8, y: 0, w: 4.53, h: 7.5, fill: { color: TH.forest }, line: { color: TH.forest } });
  s.addText("COOPS APP  /  PILOTAGE DES LIVRAISONS", { x: 0.7, y: 0.6, w: 7.8, h: 0.4, fontSize: 12, bold: true, color: TH.gold, fontFace: FB, charSpacing: 3, margin: 0 });
  s.addText("Rapport de campagne cacao", { x: 0.7, y: 1.8, w: 7.8, h: 1.8, fontSize: 46, bold: true, color: TH.white, fontFace: FT, valign: "top", margin: 0 });
  s.addText(p.cooperativeName, { x: 0.7, y: 3.8, w: 7.8, h: 0.5, fontSize: 20, color: TH.leafLight, fontFace: FB, margin: 0 });
  s.addText(`Périmètre : ${p.scopeLabel}`, { x: 0.7, y: 4.35, w: 7.8, h: 0.4, fontSize: 14, color: "D7DDD2", fontFace: FB, margin: 0 });
  if (p.period.from || p.period.to)
    s.addText(`Période : ${p.period.from ? fmtDate(p.period.from) : "début"} – ${p.period.to ? fmtDate(p.period.to) : "fin"}`, { x: 0.7, y: 4.75, w: 7.8, h: 0.4, fontSize: 14, color: "D7DDD2", fontFace: FB, margin: 0 });
  s.addText(`Données arrêtées le ${p.generatedAt.toLocaleDateString("fr-FR")} à ${p.generatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${p.userEmail ? `  ·  ${p.userEmail}` : ""}`, { x: 0.7, y: 6.6, w: 7.8, h: 0.4, fontSize: 11, color: "A8B5A8", fontFace: FB, margin: 0 });
  s.addText("CAMPAGNE", { x: 8.8, y: 1.5, w: 4.53, h: 0.4, fontSize: 12, bold: true, color: TH.gold, align: "center", charSpacing: 4, fontFace: FB });
  s.addText(p.campaign, { x: 8.8, y: 1.9, w: 4.53, h: 0.9, fontSize: 36, bold: true, color: TH.white, align: "center", fontFace: FT });
  s.addText("VOLUME LIVRÉ", { x: 8.8, y: 3.6, w: 4.53, h: 0.4, fontSize: 12, bold: true, color: TH.gold, align: "center", charSpacing: 4, fontFace: FB });
  s.addText(kg(p.metrics.totals.delivered), { x: 8.8, y: 4.0, w: 4.53, h: 0.8, fontSize: 30, bold: true, color: TH.white, align: "center", fontFace: FT });
  s.addText(`${int(p.metrics.totals.shipments)} chargement(s) · ${int(p.metrics.totals.producersDelivering)} producteur(s)`, { x: 8.8, y: 4.8, w: 4.53, h: 0.4, fontSize: 13, color: TH.leafLight, align: "center", fontFace: FB });
}

function summary(d: Deck) {
  const T = d.p.metrics.totals;
  const s = d.content("1. Synthèse exécutive", "Vue d'ensemble de la campagne");
  // Héros : taux
  s.addText(T.rate === null ? "—" : pct(T.rate), { x: 0.6, y: 1.55, w: 4.2, h: 1.3, fontSize: 64, bold: true, color: TH.forest, fontFace: FT, margin: 0 });
  s.addText(T.rate === null ? "Taux de réalisation non calculable (potentiel absent)" : "Taux de réalisation (livré / potentiel)", { x: 0.6, y: 2.85, w: 4.2, h: 0.4, fontSize: 12, color: TH.muted, fontFace: FB, margin: 0 });
  const r = Math.min(T.rate ?? 0, 100);
  s.addShape(d.pptx.ShapeType.rect, { x: 0.6, y: 3.4, w: 4.0, h: 0.2, fill: { color: TH.sand }, line: { color: TH.sand } });
  if (r > 0) s.addShape(d.pptx.ShapeType.rect, { x: 0.6, y: 3.4, w: Math.max(0.05, 4.0 * r / 100), h: 0.2, fill: { color: TH.gold }, line: { color: TH.gold } });
  s.addText([
    { text: `Potentiel : ${kg(T.potential)}`, options: { breakLine: true } },
    { text: `Restant à livrer : ${kg(T.remaining)}`, options: { breakLine: true } },
    { text: `Moyenne / chargement : ${optKg(T.avgPerShipment)}`, options: { breakLine: true } },
    { text: `Moyenne / producteur livrant : ${optKg(T.avgPerProducer)}` },
  ], { x: 0.6, y: 3.8, w: 4.3, h: 1.9, fontSize: 13, color: TH.text, fontFace: FB, valign: "top", paraSpaceAfter: 6, margin: 0 });

  const cards: Array<[string, string, string, string]> = [
    ["Volume livré", kg(T.delivered), t(T.delivered), TH.forest],
    ["Restant à livrer", kg(T.remaining), t(T.remaining), TH.alert],
    ["Chargements officiels", int(T.shipments), "non annulés", TH.gold],
    ["Producteurs livrants", int(T.producersDelivering), `sur ${int(T.producersReferenced)} référencés`, TH.leaf],
    ["Registres livrants", int(T.registresDelivering), `sur ${int(T.registresTotal)} du périmètre`, TH.leaf],
    ["Sections livrantes", int(T.sectionsDelivering), `sur ${int(T.sectionsTotal)} référencées`, TH.leaf],
  ];
  cards.forEach(([l, v, sub, c], i) => d.kpi(s, 5.3 + (i % 3) * 2.55, 1.55 + Math.floor(i / 3) * 1.5, 2.4, l, v, sub, c));

  const parts = [`${kg(T.delivered)} livrés par ${int(T.producersDelivering)} producteur(s) distinct(s) via ${int(T.shipments)} chargement(s).`];
  if (T.rate !== null) parts.push(`Réalisation : ${pct(T.rate)} du potentiel déclaré du périmètre.`);
  if (T.producersReferenced > 0) parts.push(`${pct((T.producersDelivering / T.producersReferenced) * 100)} des producteurs référencés ont livré.`);
  d.note(s, "Lecture", parts.join(" "), 5.0, 1.0);
}

function monthlySlide(d: Deck) {
  const M = d.p.metrics.monthly;
  const s = d.content("2. Évolution des livraisons", "Collecte mensuelle de la campagne");
  if (!M.some((m) => m.delivered > 0)) return d.empty(s, "Aucune livraison enregistrée sur la campagne sélectionnée.");
  d.bars(s, M.map((m) => m.label), [{ name: "Volume livré (kg)", values: M.map((m) => m.delivered) }], { x: 0.5, y: 1.45, w: 7.2, h: 4.6, title: "Volume livré par mois (kg)" });
  const rows = M.filter((m) => m.status !== "a_venir").map((m) => [
    m.label,
    m.status === "sans_livraison" ? "Aucune livraison" : int(m.delivered),
    String(m.shipments), String(m.producers),
    m.variation === null ? "—" : `${m.variation > 0 ? "+" : ""}${m.variation.toFixed(0)} %`,
  ]);
  d.table(s, ["Mois", "Livré (kg)", "Charg.", "Prod.", "Var."], rows, 7.9, 1.5, 4.9, [1.2, 1.3, 0.75, 0.75, 0.9], 10);
  const best = [...M].sort((a, b) => b.delivered - a.delivered)[0];
  const future = M.filter((m) => m.status === "a_venir").length;
  d.note(s, "Lecture", `Mois le plus actif : ${best.label} (${kg(best.delivered)}). « Aucune livraison » = mois échu sans ligne enregistrée${future ? ` ; ${future} mois non échus exclus du tableau` : ""}. Producteurs = distincts par mois.`);
}

function registresSlide(d: Deck) {
  const R = d.p.metrics.registres;
  const s = d.content("3. Performance par registre", "Volumes, potentiel et progression par registre");
  if (R.length === 0) return d.empty(s, "Aucun registre dans le périmètre.");
  const top = R.slice(0, 10);
  d.bars(s, top.map((r) => short(r.name, 18)), [{ name: "Livré (kg)", values: top.map((r) => r.delivered) }, { name: "Restant (kg)", values: top.map((r) => r.remaining) }], { x: 0.5, y: 1.4, w: 5.6, h: 4.0, dir: "bar", stacked: true, colors: [TH.forest, TH.leafLight], title: "Livré et restant (kg)" });
  const rows = R.slice(0, 12).map((r) => [short(r.name, 20), int(r.potential), int(r.delivered), int(r.remaining), String(r.shipments), String(r.producers), String(r.sections), r.avgPerProducer === null ? "—" : int(r.avgPerProducer), r.rate === null ? "—" : `${r.rate.toFixed(1)} %`]);
  d.table(s, ["Registre", "Potentiel", "Livré", "Restant", "Ch.", "Prod.", "Sect.", "Moy./prod.", "Taux"], rows, 6.3, 1.45, 6.5, [1.5, 0.85, 0.8, 0.8, 0.45, 0.5, 0.45, 0.65, 0.5], 9);
  d.note(s, "Lecture", `Classement par volume livré décroissant. ${R[0].name} arrive en tête avec ${kg(R[0].delivered)}.${R.length > 12 ? ` ${R.length - 12} registre(s) supplémentaires en annexe.` : ""} Volumes en kg ; producteurs et sections distincts.`, 5.75, 1.15);
}

function sectionsSlide(d: Deck) {
  const S = d.p.metrics.sections;
  const s = d.content("4. Sections livrantes", "Sections ayant enregistré au moins une livraison");
  if (S.length === 0) return d.empty(s, "Aucune section n'a enregistré de livraison.");
  const top = S.slice(0, 12);
  d.bars(s, top.map((x) => short(x.name, 16)), [{ name: "Livré (kg)", values: top.map((x) => x.delivered) }], { x: 0.5, y: 1.4, w: 5.6, h: 4.6, dir: "bar", title: "Top sections par volume (kg)" });
  const rows = top.map((x, i) => [`${i + 1}. ${short(x.name, 16)}`, short(x.registre, 14), `${x.producers}/${x.referenced}`, int(x.delivered), String(x.shipments), x.avgPerProducer === null ? "—" : int(x.avgPerProducer), `${x.share.toFixed(1)} %`]);
  d.table(s, ["Section", "Registre", "Livr./réf.", "Livré (kg)", "Charg.", "Moy./prod.", "Part"], rows, 6.3, 1.45, 6.5, [1.45, 1.2, 0.8, 0.95, 0.6, 0.8, 0.7], 9);
  d.note(s, "Lecture", `${S.length} section(s) livrante(s). « Livr./réf. » distingue les producteurs ayant livré des producteurs référencés dans la section.${S.length > 12 ? " Détail complet en annexe." : ""}`);
}

function shipmentsSlide(d: Deck) {
  const C = d.p.metrics.shipments;
  const s = d.content("5. Performance par chargement", "Volumes et producteurs contributeurs par lot");
  if (C.length === 0) return d.empty(s, "Aucun chargement officiel sur le périmètre.");
  const last = C.slice(-14);
  d.bars(s, last.map((c) => short(c.label, 12)), [{ name: "Volume (kg)", values: last.map((c) => c.delivered) }], { x: 0.5, y: 1.4, w: 6.1, h: 2.4, title: "Volume par chargement (kg)", legend: false });
  d.bars(s, last.map((c) => short(c.label, 12)), [{ name: "Producteurs", values: last.map((c) => c.producers) }], { x: 0.5, y: 3.85, w: 6.1, h: 2.3, colors: [TH.gold], title: "Producteurs distincts par chargement", legend: false });
  const rows = last.slice().reverse().slice(0, 12).map((c) => [short(c.label, 12), fmtDate(c.date), short(c.registre, 12), short(c.project || "—", 10), int(c.delivered), String(c.producers), String(c.sections)]);
  d.table(s, ["Lot", "Date", "Registre", "Projet", "Livré (kg)", "Prod.", "Sect."], rows, 6.8, 1.45, 6.0, [0.9, 0.95, 1.15, 0.95, 0.95, 0.55, 0.55], 9);
  d.note(s, "Lecture", `${C.length} chargement(s), moyenne ${optKg(d.p.metrics.totals.avgPerShipment)} par chargement.${C.length > 14 ? " Graphiques : 14 derniers chargements ; liste complète en annexe." : ""}`);
}

function producersSlide(d: Deck) {
  const { totals: T, producers: P, brackets } = d.p.metrics;
  const s = d.content("6. Analyse par producteur", "Participation et concentration des volumes");
  d.kpi(s, 0.6, 1.45, 2.9, "Producteurs livrants", int(T.producersDelivering), "distincts", TH.forest);
  d.kpi(s, 0.6, 2.9, 2.9, "Référencés", int(T.producersReferenced), `${int(T.activeReferenced)} actifs`, TH.leaf);
  d.kpi(s, 0.6, 4.35, 2.9, "Taux de participation", T.producersReferenced ? pct((T.producersDelivering / T.producersReferenced) * 100) : "Non calculable", `médiane ${optKg(T.medianPerProducer)}`, TH.gold);
  if (P.length === 0) return d.empty(s, "Aucun producteur n'a livré.", 3);
  d.bars(s, brackets.map((b) => b.label), [{ name: "Producteurs", values: brackets.map((b) => b.count) }], { x: 3.7, y: 1.4, w: 4.2, h: 4.4, colors: [TH.leaf], title: "Répartition par tranche de volume", legend: false });
  const rows = P.slice(0, 10).map((x, i) => [`${i + 1}. ${short(x.name, 18)}`, short(x.section, 12), int(x.delivered)]);
  d.table(s, ["Top contributeurs", "Section", "Livré (kg)"], rows, 8.1, 1.45, 4.7, [2.3, 1.3, 1.1], 9);
  d.note(s, "Lecture", `Moyenne ${optKg(T.avgPerProducer)}, médiane ${optKg(T.medianPerProducer)} par producteur livrant.${T.top10Share !== null ? ` Les 10 premiers producteurs représentent ${pct(T.top10Share)} du volume.` : ""} Détail complet dans l'export Excel.`);
}

function categorySlide(d: Deck) {
  const { byProject, byDestination, labelDuplicates } = d.p.metrics;
  const s = d.content("7. Projets et destinations", "Répartition des volumes livrés");
  if (byProject.length === 0) return d.empty(s, "Aucune donnée de projet ou destination.");
  const donut = (data: CategoryMetric[], x: number, title: string) => {
    const top = data.slice(0, 6);
    s.addChart(d.pptx.ChartType.doughnut, [{ name: title, labels: top.map((c) => c.name), values: top.map((c) => c.delivered) }], {
      x, y: 1.4, w: 6.0, h: 3.2, holeSize: 55, showTitle: true, title, titleFontSize: 12, titleColor: TH.forestDark,
      chartColors: [TH.forest, TH.leaf, TH.gold, TH.leafLight, TH.alert, TH.muted], showLegend: true, legendPos: "r", legendFontSize: 10,
      showPercent: true, showValue: false, dataLabelColor: TH.white, dataLabelFontSize: 9,
    });
    d.table(s, ["Catégorie", "Livré (kg)", "Charg.", "Part"], top.map((c) => [short(c.name, 20), int(c.delivered), String(c.shipments), `${c.share.toFixed(1)} %`]), x + 0.2, 4.7, 5.6, [2.2, 1.4, 0.9, 1.1], 9);
  };
  donut(byProject, 0.5, "Par projet");
  donut(byDestination, 6.8, "Par destination");
  if (labelDuplicates.length) d.note(s, "Libellés à vérifier", `Doublons potentiels non fusionnés : ${labelDuplicates.join(" ; ")}.`, 6.35, 0.55);
}

function findingsSlide(d: Deck) {
  const m = d.p.metrics;
  const T = m.totals;
  const s = d.content("8. Analyses et constats", "Faits calculés et points de vigilance");
  const facts: string[] = [];
  if (m.registres[0]?.delivered) facts.push(`Registre le plus contributeur : ${m.registres[0].name} (${kg(m.registres[0].delivered)}, ${pct(T.delivered ? (m.registres[0].delivered / T.delivered) * 100 : null)} du total).`);
  if (m.sections[0]) facts.push(`Section la plus contributrice : ${m.sections[0].name} (${pct(m.sections[0].share)} du volume).`);
  const active = m.monthly.filter((x) => x.status !== "a_venir");
  const last = [...active].reverse().find((x) => x.delivered > 0);
  if (last) facts.push(`Dernier mois avec livraisons : ${last.label} — ${kg(last.delivered)}, ${last.producers} producteur(s).`);
  if (T.top10Share !== null) facts.push(`Concentration : 10 producteurs = ${pct(T.top10Share)} du volume livré.`);
  const rated = m.registres.filter((r) => r.rate !== null && r.delivered > 0);
  if (rated.length > 1) {
    const hi = rated.reduce((a, b) => ((a.rate ?? 0) > (b.rate ?? 0) ? a : b));
    const lo = rated.reduce((a, b) => ((a.rate ?? 0) < (b.rate ?? 0) ? a : b));
    facts.push(`Écart de réalisation : ${hi.name} ${pct(hi.rate)} contre ${lo.name} ${pct(lo.rate)}.`);
  }
  const vig: string[] = [];
  if (m.silentRegistres.length) vig.push(`Registre(s) sans livraison enregistrée : ${m.silentRegistres.slice(0, 5).join(", ")}${m.silentRegistres.length > 5 ? "…" : ""}.`);
  if (m.silentSections.length) vig.push(`${m.silentSections.length} section(s) référencée(s) sans livraison enregistrée.`);
  vig.push(...m.anomalies);
  if (!vig.length) vig.push("Aucune incohérence détectée entre chargements et lignes de livraison.");
  const col = (x: number, title: string, items: string[], color: string) => {
    s.addShape(d.pptx.ShapeType.rect, { x, y: 1.5, w: 5.95, h: 4.6, fill: { color: TH.white }, line: { color: TH.sand } });
    s.addShape(d.pptx.ShapeType.rect, { x, y: 1.5, w: 5.95, h: 0.08, fill: { color }, line: { color } });
    s.addText(title, { x: x + 0.3, y: 1.7, w: 5.4, h: 0.45, fontSize: 18, bold: true, color: TH.forestDark, fontFace: FT, margin: 0 });
    s.addText(items.map((txt) => ({ text: txt, options: { bullet: true, breakLine: true } })), { x: x + 0.3, y: 2.25, w: 5.4, h: 3.7, fontSize: 13, color: TH.text, fontFace: FB, valign: "top", paraSpaceAfter: 8, margin: 0, fit: "shrink" });
  };
  col(0.6, "Faits calculés", facts.length ? facts : ["Données insuffisantes pour établir des constats."], TH.forest);
  col(6.85, "Vigilance et données", vig, TH.alert);
  d.note(s, "Précaution", "L'absence de ligne de livraison n'établit pas une absence certaine d'activité : elle peut refléter une saisie incomplète.", 6.3, 0.6);
}

function recoSlide(d: Deck) {
  const m = d.p.metrics;
  const s = d.content("9. Recommandations opérationnelles", "Actions proportionnées aux constats");
  const recos: Array<[string, string]> = [];
  const lowReg = m.registres.filter((r) => r.rate !== null && r.rate < 30).slice(0, 3);
  if (lowReg.length) recos.push(["Registres à examiner", `${lowReg.map((r) => `${r.name} (${pct(r.rate)})`).join(", ")} : vérifier le calendrier de collecte et l'exhaustivité des saisies.`]);
  if (m.silentSections.length) recos.push(["Suivi terrain", `${m.silentSections.length} section(s) sans livraison : confirmer leur statut avec les délégués (ex. ${m.silentSections.slice(0, 3).join(", ")}).`]);
  if (m.neverDeliveredActive > 0) recos.push(["Producteurs non livrants", `${int(m.neverDeliveredActive)} producteur(s) actif(s) n'ont pas encore livré : liste à extraire pour relance ciblée.`]);
  if (m.anomalies.length || m.labelDuplicates.length) recos.push(["Qualité des données", `${m.anomalies.length + m.labelDuplicates.length} point(s) relevé(s) : corriger les écarts et harmoniser les libellés avant la clôture.`]);
  recos.push(["Pilotage hebdomadaire", "Régénérer ce rapport chaque semaine avec le même périmètre pour suivre volume, producteurs livrants et restant à livrer."]);
  recos.slice(0, 5).forEach(([title, body], i) => {
    const y = 1.5 + i * 0.98;
    s.addShape(d.pptx.ShapeType.ellipse, { x: 0.6, y: y + 0.1, w: 0.6, h: 0.6, fill: { color: TH.forest }, line: { color: TH.forest } });
    s.addText(String(i + 1), { x: 0.6, y: y + 0.1, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: TH.white, align: "center", valign: "middle", fontFace: FT, margin: 0 });
    s.addText(title, { x: 1.45, y, w: 11.3, h: 0.38, fontSize: 16, bold: true, color: TH.forestDark, fontFace: FT, margin: 0 });
    s.addText(body, { x: 1.45, y: y + 0.38, w: 11.3, h: 0.48, fontSize: 13, color: TH.text, fontFace: FB, margin: 0, fit: "shrink" });
  });
  d.note(s, "Note", "Les recommandations ne présument d'aucune cause : elles orientent les vérifications à mener.", 6.45, 0.45);
}

function methodSlide(d: Deck) {
  const { p } = d;
  const s = d.content("10. Méthodologie et périmètre", "Sources, définitions et limites");
  const left = [
    `Campagne : ${p.campaign} (1er septembre – 31 août).`,
    `Arrêté des données : ${p.generatedAt.toLocaleString("fr-FR")}.`,
    `Coopérative : ${p.cooperativeName}.`,
    `Registres inclus : ${p.registreNames.join(", ") || "aucun"}.`,
    `Source : lignes de livraison des chargements officiels (non annulés, non supprimés).`,
    p.period.from || p.period.to ? "Filtre de période : chargements dont la fenêtre de livraison chevauche la période." : "Aucun filtre de période.",
  ];
  const right = [
    "Volume livré = somme des poids nets des lignes de livraison.",
    "Producteurs / sections = comptés une seule fois (distincts).",
    "Taux de réalisation = livré ÷ potentiel du même périmètre × 100.",
    "Restant = potentiel restant des producteurs de la campagne (règle COOPS APP).",
    "Moyennes calculées uniquement si le dénominateur est > 0.",
    "1 tonne = 1 000 kg. Données limitées aux droits de l'utilisateur.",
  ];
  const col = (x: number, title: string, items: string[]) => {
    s.addText(title, { x, y: 1.5, w: 5.9, h: 0.45, fontSize: 18, bold: true, color: TH.forest, fontFace: FT, margin: 0 });
    s.addText(items.map((txt) => ({ text: txt, options: { bullet: true, breakLine: true } })), { x, y: 2.05, w: 5.9, h: 3.9, fontSize: 13, color: TH.text, fontFace: FB, valign: "top", paraSpaceAfter: 8, margin: 0, fit: "shrink" });
  };
  col(0.6, "Périmètre", left);
  col(6.9, "Règles de calcul", right);
  const lim = p.metrics.anomalies.length ? `Limites : ${p.metrics.anomalies.join(" ")}` : "Limites : aucune donnée manquante détectée sur les champs utilisés.";
  d.note(s, "Données", lim, 6.15, 0.75);
}

function annexes(d: Deck) {
  const m = d.p.metrics;
  const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
  const maxPages = 3;
  chunk(m.registres, 16).slice(0, maxPages).forEach((rows, i) => {
    const s = d.content("Annexe", `Détail des registres${i ? ` (suite ${i + 1})` : ""}`);
    d.table(s, ["Registre", "Potentiel (kg)", "Livré (kg)", "Restant (kg)", "Charg.", "Producteurs", "Sections", "Taux"], rows.map((r) => [r.name, int(r.potential), int(r.delivered), int(r.remaining), String(r.shipments), String(r.producers), String(r.sections), r.rate === null ? "—" : `${r.rate.toFixed(1)} %`]), 0.6, 1.5, 12.2, [3.4, 1.4, 1.4, 1.4, 0.9, 1.2, 1.1, 1.4], 10);
  });
  chunk(m.sections, 16).slice(0, maxPages).forEach((rows, i) => {
    const s = d.content("Annexe", `Détail des sections${i ? ` (suite ${i + 1})` : ""}`);
    d.table(s, ["Section", "Registre", "Prod. livrants", "Prod. référencés", "Livré (kg)", "Charg.", "Part"], rows.map((x) => [x.name, x.registre, String(x.producers), String(x.referenced), int(x.delivered), String(x.shipments), `${x.share.toFixed(1)} %`]), 0.6, 1.5, 12.2, [2.8, 2.8, 1.3, 1.4, 1.6, 1.0, 1.3], 10);
  });
  chunk(m.shipments, 16).slice(0, maxPages).forEach((rows, i) => {
    const s = d.content("Annexe", `Détail des chargements${i ? ` (suite ${i + 1})` : ""}`);
    d.table(s, ["Lot", "Date", "Registre", "Projet", "Destination", "Livré (kg)", "Prod.", "Sect.", "Moy./prod."], rows.map((c) => [c.label, fmtDate(c.date), c.registre, c.project || "—", c.destination || "—", int(c.delivered), String(c.producers), String(c.sections), c.avgPerProducer === null ? "—" : int(c.avgPerProducer)]), 0.6, 1.5, 12.2, [1.3, 1.1, 2.0, 1.6, 1.8, 1.3, 0.8, 0.8, 1.5], 10);
  });
  const truncated = [m.registres, m.sections, m.shipments].some((a) => a.length > 16 * maxPages);
  if (truncated) {
    const s = d.content("Annexe", "Détails complémentaires");
    d.empty(s, "Les listes complètes (registres, sections, chargements, producteurs) sont disponibles dans le fichier Excel exporté avec ce rapport.");
  }
}

export function buildFileName(p: ReportPayload, ext: "pptx" | "xlsx") {
  const scope = p.scopeLabel === "Tous les registres" ? "Tous_registres" : p.scopeLabel.replace(/^Registre\s+/, "Registre_");
  const safe = scope.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_");
  return `Rapport_COOPS_APP_${p.campaign}_${safe}_${p.generatedAt.toISOString().slice(0, 10)}.${ext}`;
}

export async function generateReport(payload: ReportPayload): Promise<{ fileName: string }> {
  const d = new Deck(payload);
  cover(d);
  summary(d);
  monthlySlide(d);
  registresSlide(d);
  sectionsSlide(d);
  shipmentsSlide(d);
  producersSlide(d);
  categorySlide(d);
  findingsSlide(d);
  recoSlide(d);
  methodSlide(d);
  annexes(d);
  const fileName = buildFileName(payload, "pptx");
  await d.pptx.writeFile({ fileName });
  return { fileName };
}

/** Annexe Excel exhaustive (producteurs, sections, chargements, registres). */
export async function generateReportAnnex(payload: ReportPayload): Promise<{ fileName: string }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const m = payload.metrics;
  const sheet = (name: string, head: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(head).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => { c.width = 18; });
  };
  sheet("Producteurs", ["Nom", "Code plantation", "Section", "Registre", "Livré (kg)", "Livraisons"], m.producers.map((p) => [p.name, p.code, p.section, p.registre, p.delivered, p.deliveries]));
  sheet("Sections", ["Section", "Registre", "Producteurs livrants", "Producteurs référencés", "Livré (kg)", "Chargements", "Part (%)"], m.sections.map((s) => [s.name, s.registre, s.producers, s.referenced, s.delivered, s.shipments, Number(s.share.toFixed(2))]));
  sheet("Chargements", ["Lot", "Date", "Registre", "Projet", "Destination", "Livré (kg)", "Poids déclaré (kg)", "Producteurs", "Sections"], m.shipments.map((c) => [c.label, fmtDate(c.date), c.registre, c.project, c.destination, c.delivered, c.declared, c.producers, c.sections]));
  sheet("Registres", ["Registre", "Potentiel (kg)", "Livré (kg)", "Restant (kg)", "Chargements", "Producteurs", "Sections", "Taux (%)"], m.registres.map((r) => [r.name, r.potential, r.delivered, r.remaining, r.shipments, r.producers, r.sections, r.rate === null ? "Non calculable" : Number(r.rate.toFixed(2))]));
  const buf = await wb.xlsx.writeBuffer();
  const fileName = buildFileName(payload, "xlsx");
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
  return { fileName };
}
