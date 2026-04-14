import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Download } from "lucide-react";
import { toast } from "sonner";
import PptxGenJS from "pptxgenjs";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardData: {
    totalPotential: number;
    totalDelivered: number;
    remaining: number;
    shipmentCount: number;
    coopStats: Array<{ name: string; potentiel: number; delivered: number; remaining: number; shipmentCount: number }>;
    byProject: Array<{ name: string; value: number }>;
    byPartner: Array<{ name: string; value: number }>;
    campaign: string;
  };
}

const COLORS = {
  primary: "5B3A1A",
  accent: "2E7D32",
  bg: "FFFFFF",
  text: "333333",
  lightBg: "F5F0EB",
  headerBg: "3E2723",
};

export default function ReportDialog({ open, onOpenChange, dashboardData }: ReportDialogProps) {
  const [email, setEmail] = useState("");
  const [generating, setGenerating] = useState(false);

  const generatePptx = async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Système de gestion";
    pptx.title = `Rapport - Campagne ${dashboardData.campaign}`;

    // Slide 1: Title
    const slide1 = pptx.addSlide();
    slide1.background = { color: COLORS.headerBg };
    slide1.addText("Rapport de Campagne", { x: 0.5, y: 1.5, w: 12.3, h: 1.5, fontSize: 40, bold: true, color: "FFFFFF", align: "center" });
    slide1.addText(`Campagne ${dashboardData.campaign}`, { x: 0.5, y: 3, w: 12.3, h: 0.8, fontSize: 24, color: "CCCCCC", align: "center" });
    slide1.addText(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, { x: 0.5, y: 4, w: 12.3, h: 0.6, fontSize: 14, color: "999999", align: "center" });

    // Slide 2: KPIs
    const slide2 = pptx.addSlide();
    slide2.addText("Indicateurs de Performance", { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: COLORS.headerBg });
    const kpis = [
      { label: "Potentiel total", value: `${dashboardData.totalPotential.toLocaleString("fr-FR")} kg`, color: COLORS.primary },
      { label: "Total livré", value: `${dashboardData.totalDelivered.toLocaleString("fr-FR")} kg`, color: COLORS.accent },
      { label: "Restant", value: `${dashboardData.remaining.toLocaleString("fr-FR")} kg`, color: "E65100" },
      { label: "Chargements", value: `${dashboardData.shipmentCount}`, color: "1565C0" },
    ];
    kpis.forEach((kpi, i) => {
      const x = 0.5 + i * 3.1;
      slide2.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.8, h: 2, fill: { color: COLORS.lightBg }, rectRadius: 0.1 });
      slide2.addText(kpi.value, { x, y: 1.7, w: 2.8, h: 1, fontSize: 28, bold: true, color: kpi.color, align: "center" });
      slide2.addText(kpi.label, { x, y: 2.7, w: 2.8, h: 0.5, fontSize: 12, color: COLORS.text, align: "center" });
    });
    const rate = dashboardData.totalPotential > 0 ? ((dashboardData.totalDelivered / dashboardData.totalPotential) * 100).toFixed(1) : "0";
    slide2.addText(`Taux de réalisation : ${rate}%`, { x: 0.5, y: 4, w: 12.3, h: 0.6, fontSize: 18, bold: true, color: COLORS.accent, align: "center" });

    // Slide 3: Projects
    const slide3 = pptx.addSlide();
    slide3.addText("Répartition par Projet", { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: COLORS.headerBg });
    if (dashboardData.byProject.length > 0) {
      const rows: any[][] = [
        [{ text: "Projet", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 12 } },
         { text: "Poids (kg)", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 12, align: "right" } },
         { text: "Part (%)", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 12, align: "right" } }],
      ];
      const totalProject = dashboardData.byProject.reduce((s, p) => s + p.value, 0);
      dashboardData.byProject.forEach((p, i) => {
        const bg = i % 2 === 0 ? COLORS.lightBg : COLORS.bg;
        rows.push([
          { text: p.name, options: { fill: { color: bg }, fontSize: 11 } },
          { text: p.value.toLocaleString("fr-FR"), options: { fill: { color: bg }, fontSize: 11, align: "right" } },
          { text: totalProject > 0 ? `${((p.value / totalProject) * 100).toFixed(1)}%` : "0%", options: { fill: { color: bg }, fontSize: 11, align: "right" } },
        ]);
      });
      slide3.addTable(rows, { x: 1, y: 1.3, w: 11.3, colW: [5, 3, 3.3], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
    } else {
      slide3.addText("Aucune donnée disponible", { x: 0.5, y: 2.5, w: 12.3, h: 0.6, fontSize: 16, color: "999999", align: "center" });
    }

    // Slide 4: Partners
    const slide4 = pptx.addSlide();
    slide4.addText("Répartition par Partenaire", { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: COLORS.headerBg });
    if (dashboardData.byPartner.length > 0) {
      const rows: any[][] = [
        [{ text: "Partenaire", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 12 } },
         { text: "Poids (kg)", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 12, align: "right" } }],
      ];
      dashboardData.byPartner.forEach((p, i) => {
        const bg = i % 2 === 0 ? COLORS.lightBg : COLORS.bg;
        rows.push([
          { text: p.name, options: { fill: { color: bg }, fontSize: 11 } },
          { text: p.value.toLocaleString("fr-FR"), options: { fill: { color: bg }, fontSize: 11, align: "right" } },
        ]);
      });
      slide4.addTable(rows, { x: 1, y: 1.3, w: 11.3, colW: [6, 5.3], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
    }

    // Slide 5: Cooperatives
    const slide5 = pptx.addSlide();
    slide5.addText("Performance par Coopérative", { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: COLORS.headerBg });
    if (dashboardData.coopStats.length > 0) {
      const rows: any[][] = [
        [
          { text: "Coopérative", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 10 } },
          { text: "Potentiel", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 10, align: "right" } },
          { text: "Livré", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 10, align: "right" } },
          { text: "Restant", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 10, align: "right" } },
          { text: "Taux", options: { bold: true, fill: { color: COLORS.headerBg }, color: "FFFFFF", fontSize: 10, align: "right" } },
        ],
      ];
      dashboardData.coopStats.slice(0, 15).forEach((c, i) => {
        const bg = i % 2 === 0 ? COLORS.lightBg : COLORS.bg;
        const taux = c.potentiel > 0 ? `${((c.delivered / c.potentiel) * 100).toFixed(1)}%` : "—";
        rows.push([
          { text: c.name, options: { fill: { color: bg }, fontSize: 9 } },
          { text: c.potentiel.toLocaleString("fr-FR"), options: { fill: { color: bg }, fontSize: 9, align: "right" } },
          { text: c.delivered.toLocaleString("fr-FR"), options: { fill: { color: bg }, fontSize: 9, align: "right" } },
          { text: c.remaining.toLocaleString("fr-FR"), options: { fill: { color: bg }, fontSize: 9, align: "right" } },
          { text: taux, options: { fill: { color: bg }, fontSize: 9, align: "right" } },
        ]);
      });
      slide5.addTable(rows, { x: 0.3, y: 1.3, w: 12.7, colW: [3.5, 2.3, 2.3, 2.3, 2.3], border: { type: "solid", pt: 0.5, color: "CCCCCC" } });
    }

    // Slide 6: Summary
    const slide6 = pptx.addSlide();
    slide6.background = { color: COLORS.headerBg };
    slide6.addText("Synthèse & Recommandations", { x: 0.5, y: 0.5, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: "FFFFFF" });
    const summaryLines = [
      `• Potentiel total de livraison : ${dashboardData.totalPotential.toLocaleString("fr-FR")} kg`,
      `• Volume livré : ${dashboardData.totalDelivered.toLocaleString("fr-FR")} kg (${rate}%)`,
      `• Volume restant : ${dashboardData.remaining.toLocaleString("fr-FR")} kg`,
      `• Nombre de chargements réalisés : ${dashboardData.shipmentCount}`,
      `• Nombre de coopératives actives : ${dashboardData.coopStats.length}`,
      "",
      dashboardData.totalPotential > 0 && Number(rate) < 50
        ? "⚠ Le taux de réalisation est inférieur à 50%. Il est recommandé d'intensifier les collectes."
        : "✅ La campagne progresse de manière satisfaisante.",
    ];
    slide6.addText(summaryLines.join("\n"), { x: 1, y: 1.8, w: 11.3, h: 4, fontSize: 16, color: "DDDDDD", lineSpacingMultiple: 1.5 });

    return pptx;
  };

  const handleGenerate = async () => {
    if (!email.trim()) {
      toast.error("Veuillez saisir une adresse email");
      return;
    }
    setGenerating(true);
    try {
      const pptx = await generatePptx();
      await pptx.writeFile({ fileName: `Rapport_Campagne_${dashboardData.campaign}.pptx` });
      toast.success("Rapport généré et téléchargé avec succès !");
      onOpenChange(false);
      setEmail("");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la génération du rapport");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Envoyer un rapport
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Adresse e-mail du destinataire</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Un rapport PowerPoint sera généré avec toutes les données du tableau de bord et téléchargé automatiquement.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Générer et télécharger
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
