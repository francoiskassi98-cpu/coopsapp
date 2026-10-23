import { describe, it, expect } from "vitest";
import { computeReportMetrics, campaignMonths } from "@/lib/report-metrics";

const base = () => ({
  campaign: "2026-2027",
  now: new Date("2026-11-15"),
  registreNames: { R1: "RA", R2: "RB" },
  scopeRegistreIds: ["R1", "R2"],
  producers: [
    { id: "P1", registre_id: "R1", section: "Zatoboua", name: "A", code: "C1", delivery_potential: 1000, remaining_potential: 400, is_active: true },
    { id: "P2", registre_id: "R1", section: "Zatoboua", name: "B", code: "C2", delivery_potential: 1000, remaining_potential: 1000, is_active: true },
    { id: "P3", registre_id: "R2", section: "Man", name: "C", code: "C3", delivery_potential: 2000, remaining_potential: 1700, is_active: true },
  ],
  shipments: [
    { id: "S1", lot_number: "1", connaissement: null, project: "Fairtrade", destination: "Abidjan", registre_id: "R1", total_weight: 400, created_at: "2026-09-10", delivery_start: "2026-09-10", partner: null },
    { id: "S2", lot_number: "2", connaissement: null, project: "FAIRTRADE", destination: "Abidjan", registre_id: "R1", total_weight: 200, created_at: "2026-10-10", delivery_start: "2026-10-10", partner: null },
    { id: "S3", lot_number: "1", connaissement: null, project: "RA", destination: "San Pedro", registre_id: "R2", total_weight: 300, created_at: "2026-10-12", delivery_start: "2026-10-12", partner: null },
  ],
  deliveries: [
    { shipment_id: "S1", producer_id: "P1", registre_id: "R1", net_weight: 400, delivery_date: "2026-09-10" },
    { shipment_id: "S2", producer_id: "P1", registre_id: "R1", net_weight: 200, delivery_date: "2026-10-10" },
    { shipment_id: "S3", producer_id: "P3", registre_id: "R2", net_weight: 300, delivery_date: "2026-10-12" },
    { shipment_id: "DRAFT", producer_id: "P2", registre_id: "R1", net_weight: 999, delivery_date: "2026-10-12" },
  ],
});

describe("rapport de campagne", () => {
  it("compte un producteur ayant livré deux fois une seule fois", () => {
    expect(computeReportMetrics(base()).totals.producersDelivering).toBe(2);
  });
  it("ignore les livraisons hors chargements officiels", () => {
    expect(computeReportMetrics(base()).totals.delivered).toBe(900);
  });
  it("calcule le taux sur le potentiel du même périmètre", () => {
    expect(computeReportMetrics(base()).totals.rate).toBeCloseTo(22.5);
  });
  it("ventile par registre trié par volume", () => {
    const r = computeReportMetrics(base()).registres;
    expect(r.map((x) => [x.name, x.delivered, x.producers])).toEqual([["RA", 600, 1], ["RB", 300, 1]]);
  });
  it("distingue producteurs livrants et référencés par section", () => {
    const s = computeReportMetrics(base()).sections.find((x) => x.name === "Zatoboua")!;
    expect([s.producers, s.referenced]).toEqual([1, 2]);
  });
  it("distingue mois sans livraison et mois à venir", () => {
    const m = computeReportMetrics(base()).monthly;
    expect(m.find((x) => x.key === "2026-11")!.status).toBe("sans_livraison");
    expect(m.find((x) => x.key === "2026-12")!.status).toBe("a_venir");
  });
  it("signale les libellés de projet en doublon sans les fusionner", () => {
    const r = computeReportMetrics(base());
    expect(r.byProject.length).toBe(3);
    expect(r.labelDuplicates).toContain("Fairtrade / FAIRTRADE");
  });
  it("campagne de septembre à août", () => {
    const m = campaignMonths("2026-2027");
    expect([m[0], m[11]]).toEqual(["2026-09", "2027-08"]);
  });
});
