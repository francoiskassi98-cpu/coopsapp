import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { distributeShipment, getCurrentCampaign, normalizeCampaign, type DistributionResult } from "@/lib/shipment-utils";
import { useSortableTable, SortableHeader } from "@/hooks/useSortableTable";
import { toast } from "@/hooks/use-toast";
import { Truck, Plus, Download, Pencil, Check, X, FileSpreadsheet, FolderPlus, Maximize2, Minimize2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImportShipments from "@/pages/ImportShipments";
import ShipmentDetails from "@/components/ShipmentDetails";
import ShipmentHistory from "@/components/ShipmentHistory";
import { TemplatePreview, type TemplatePreviewData } from "@/components/shipments/TemplatePreview";
import PageHeader from "@/components/PageHeader";
import { useActiveShipmentTemplates } from "@/hooks/useShipmentTemplates";
import { buildEligibleProducers, validateDistributionBeforeSave, MIN_REMAINING_WEIGHT_KG, MIN_DAYS_BETWEEN_DELIVERIES } from "@/lib/producer-eligibility";


interface PartnerOption {
  id: string;
  name: string;
  cooperative_id?: string | null;
  logo_path?: string | null;
  status?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  cooperative_id: string;
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const asError = (e: unknown): SupabaseLikeError =>
  (typeof e === "object" && e !== null ? (e as SupabaseLikeError) : { message: String(e) });

export default function CreateShipment() {
  const [totalWeight, setTotalWeight] = useState("");
  const [totalBags, setTotalBags] = useState("");
  const [connaissement, setConnaissement] = useState("");
  const [driverName, setDriverName] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [project, setProject] = useState(""); // project_id
  const [partnerId, setPartnerId] = useState("");
  const [zone, setZone] = useState("");
  const [destination, setDestination] = useState("");
  
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState<{ name: string; code: string; partner_id: string; description: string; is_active: boolean }>({ name: "", code: "", partner_id: "", description: "", is_active: true });
  const [creatingProject, setCreatingProject] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<DistributionResult[]>([]);
  const [saving, setSaving] = useState(false);
  /** Verrou synchrone : bloque le 2e clic avant même le re-render React. */
  const savingRef = useRef(false);
  /** Clé d'idempotence envoyée à la base (index unique) pour garantir un seul enregistrement. */
  const requestIdRef = useRef<string | null>(null);
  /** Potentiel restant par producteur au moment du calcul de la distribution (détection de changement avant enregistrement). */
  const remainingSnapshotRef = useRef<Record<string, number>>({});
  /** N° de lot réservé à l'enregistrement (réutilisé si une tentative échoue puis est relancée). */
  const lotNumberRef = useRef<number | null>(null);
  const [lotNumber, setLotNumber] = useState<number | null>(null);
  const [saveDiagnostic, setSaveDiagnostic] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [editWeight, setEditWeight] = useState("");
  const [editBags, setEditBags] = useState("");
  const { sortConfig, toggleSort, sortData } = useSortableTable();
  const { role } = useAuth();
  const canCreateProject = role === "super_admin" || role === "coop_admin" || role === "agent";

  const [cooperatives, setCooperatives] = useState<{ id: string; name: string; cooperative_id?: string }[]>([]);
  const [coopStats, setCoopStats] = useState<{ potentiel: number; delivered: number; remaining: number } | null>(null);
  const [suggestedReceipt, setSuggestedReceipt] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [selectedCoopId, setSelectedCoopId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [partnersRes, registresRes] = await Promise.all([
        supabase.from("partners").select("id, name, cooperative_id, logo_path, status").order("name"),
        supabase.from("registres").select("id, name, cooperative_id").order("name"),
      ]);
      if (cancelled) return;
      setPartners(partnersRes.data || []);
      setCooperatives((registresRes.data || []) as { id: string; name: string; cooperative_id?: string }[]);
    })();
    return () => { cancelled = true; };
  }, []);


  const { templates, loading: templatesLoading } = useActiveShipmentTemplates(selectedCoopId || null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );

  // Auto-sélection du modèle par défaut lorsque la liste change
  useEffect(() => {
    if (!selectedCoopId || templatesLoading) return;
    if (templateId && templates.some((t) => t.id === templateId)) return;
    const def = templates.find((t) => t.is_default) || templates[0];
    setTemplateId(def?.id || "");
  }, [templates, templatesLoading, selectedCoopId, templateId]);

  // Les projets appartiennent à la coopérative : aucun filtre par registre.
  const loadProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, code, description, is_active, cooperative_id")
      .eq("is_active", true)
      .order("name");
    if (error) { console.error("[CreateShipment.projects]", error); setProjects([]); return; }
    setProjects((data || []) as ProjectOption[]);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  /** Statistiques du seul registre sélectionné (au lieu de charger toute la base). */
  const loadCoopStats = useCallback(async (registreId: string, registreName: string) => {
    if (!registreId) { setCoopStats(null); return; }
    setCoopStats(null);
    const PAGE = 1000;
    const loadProducers = async () => {
      let potentiel = 0, remaining = 0, from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("producers")
          .select("delivery_potential, remaining_potential")
          .eq("registre_id", registreId)
          .range(from, from + PAGE - 1);
        if (error) { console.error("[CreateShipment.stats.producers]", error); break; }
        if (!data || data.length === 0) break;
        data.forEach((p) => {
          potentiel += Number(p.delivery_potential) || 0;
          remaining += Number(p.remaining_potential) || 0;
        });
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return { potentiel, remaining };
    };
    const loadDelivered = async () => {
      let delivered = 0, from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("shipments")
          .select("total_weight")
          .eq("registre_id", registreId)
          .eq("status", "active")
          .range(from, from + PAGE - 1);
        if (error) { console.error("[CreateShipment.stats.shipments]", error); break; }
        if (!data || data.length === 0) break;
        data.forEach((s) => { delivered += Number(s.total_weight) || 0; });
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return delivered;
    };
    const [pot, delivered] = await Promise.all([loadProducers(), loadDelivered()]);
    setCoopStats({ potentiel: pot.potentiel, remaining: pot.remaining, delivered });
  }, []);

  const loadNextReceiptForCooperative = useCallback(async (registreId: string) => {
    if (!registreId) { setSuggestedReceipt(""); setReceiptNumber(""); return; }

    // RPC : MAX(receipt_number::bigint) calculé côté serveur en une seule requête.
    const { data, error } = await supabase.rpc("get_max_receipt_number", { p_registre_id: registreId });

    if (error) {
      console.error("[CreateShipment] get_max_receipt_number", error);
      setSuggestedReceipt("000001");
      setReceiptNumber("");
      return;
    }

    const maxNum = data ? parseInt(String(data).replace(/\D/g, ""), 10) : 0;
    setSuggestedReceipt(String((isNaN(maxNum) ? 0 : maxNum) + 1).padStart(6, "0"));
    setReceiptNumber("");
  }, []);

  const handleZoneChange = (coopId: string) => {
    setSelectedCoopId(coopId);
    const coop = cooperatives.find(c => c.id === coopId);
    const name = coop?.name || "";
    setZone(name);
    setTemplateId("");
    void loadNextReceiptForCooperative(coopId);
    void loadCoopStats(coopId, name);
  };

  const selectedCoopStats = coopStats;


  const missingFields = useMemo(() => {
    const m: string[] = [];
    if (!totalWeight) m.push("Poids total");
    if (!totalBags) m.push("Nombre de sacs");
    if (!connaissement.trim()) m.push("N° Connaissement");
    if (!startDate) m.push("Date début");
    if (!endDate) m.push("Date fin");
    if (!project) m.push("Projet");
    if (!partnerId) m.push("Partenaire");
    if (!selectedCoopId) m.push("Registre");
    if (!destination) m.push("Destination");
    if (!driverName.trim()) m.push("Chauffeur");
    if (!truckNumber.trim()) m.push("N° Camion");
    if (!trailerNumber.trim()) m.push("N° Remorque");
    if (!departureDate) m.push("Date départ");
    if (!templateId) m.push("Modèle de chargement");
    return m;
  }, [totalWeight, totalBags, connaissement, startDate, endDate, project, partnerId, selectedCoopId, destination, driverName, truckNumber, trailerNumber, departureDate, templateId]);

  /** Contrôles de cohérence (au-delà des champs simplement requis). */
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    const w = Number(totalWeight);
    const b = Number(totalBags);
    if (totalWeight && (!Number.isFinite(w) || w <= 0)) errs.push("Le poids total doit être un nombre supérieur à 0.");
    if (totalBags && (!Number.isInteger(b) || b <= 0)) errs.push("Le nombre de sacs doit être un entier supérieur à 0.");
    if (w > 0 && b > 0) {
      const avg = w / b;
      if (avg > 90) errs.push(`Poids moyen par sac trop élevé (${avg.toFixed(1)} kg) — maximum 90 kg.`);
      if (avg < 10) errs.push(`Poids moyen par sac trop faible (${avg.toFixed(1)} kg) — minimum 10 kg.`);
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    if ((startDate && startDate > todayIso) || (endDate && endDate > todayIso)) {
      errs.push("Pas possible d'effectuer un chargement avec cette date.");
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      errs.push("La date de fin doit être postérieure ou égale à la date de début.");
    }
    if (departureDate && endDate && new Date(departureDate) < new Date(endDate)) {
      errs.push("La date de départ ne peut pas précéder la date de fin des livraisons.");
    }
    if (coopStats && w > 0 && coopStats.remaining > 0 && w > coopStats.remaining) {
      errs.push(`Le poids total (${w.toLocaleString("fr-FR")} kg) dépasse le potentiel restant du registre (${coopStats.remaining.toLocaleString("fr-FR")} kg).`);
    }
    return errs;
  }, [totalWeight, totalBags, startDate, endDate, departureDate, coopStats]);


  const formatTechnicalError = (error: unknown, context: string) => {
    const e = asError(error);
    const parts = [
      context,
      e.code ? `Code: ${e.code}` : null,
      e.message ? `Message: ${e.message}` : null,
      e.details ? `Détails: ${e.details}` : null,
      e.hint ? `Indice: ${e.hint}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  };

  const handleCalculate = async () => {
    setSaveDiagnostic(null);
    if (missingFields.length > 0) {
      toast({ title: "Champs requis manquants", description: `Renseignez : ${missingFields.join(", ")}.`, variant: "destructive" });
      return;
    }
    if (validationErrors.length > 0) {
      setSaveDiagnostic(validationErrors.join("\n"));
      toast({ title: "Données incohérentes", description: validationErrors[0], variant: "destructive" });
      return;
    }


    // Construction automatique de la liste des producteurs éligibles (règles métier)
    let eligibility;
    try {
      eligibility = await buildEligibleProducers(selectedCoopId, new Date(startDate));
    } catch (error) {
      console.error("[CreateShipment] eligibility build failed", error);
      toast({ title: "Erreur chargement producteurs", description: "Une erreur est survenue.", variant: "destructive" });
      return;
    }

    setExclusions(eligibility.excluded.map((e) => e.message));

    const producers = eligibility.eligible;

    if (producers.length === 0) {
      toast({
        title: "Aucun producteur éligible",
        description: `Tous les producteurs du registre sont exclus (poids restant < ${MIN_REMAINING_WEIGHT_KG} kg, potentiel atteint ou délai de ${MIN_DAYS_BETWEEN_DELIVERIES} jours non écoulé).`,
        variant: "destructive",
      });
      setPreview([]);
      return;
    }

    const effectiveReceipt = receiptNumber.trim() || suggestedReceipt;
    const lastNum = effectiveReceipt ? parseInt(effectiveReceipt, 10) - 1 : 0;

    const results = distributeShipment(
      producers.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        section: p.section,
        plantation_code: p.plantation_code,
        remaining_potential: p.remaining_potential,
        delivery_potential: p.delivery_potential,
      })),
      Number(totalWeight),
      Number(totalBags),
      new Date(startDate),
      new Date(endDate),
      lastNum
    );

    // Sécurité : ne jamais dépasser le potentiel restant, exclure les volumes < 50 kg
    const remainingById = new Map<string, number>(producers.map((p) => [p.id, p.remaining_potential] as [string, number]));
    const capped = results
      .map((r) => {
        const max = remainingById.get(r.producer_id) ?? 0;
        const weight = Math.min(r.allocated_weight, max);
        return { ...r, allocated_weight: weight };
      })
      .filter((r) => r.allocated_weight >= MIN_REMAINING_WEIGHT_KG);

    if (capped.length === 0) {
      toast({ title: "Distribution impossible", description: "Le potentiel restant des producteurs éligibles est insuffisant.", variant: "destructive" });
      return;
    }

    // Le N° de lot n'est attribué qu'à l'enregistrement (aucun numéro consommé par un simple recalcul).
    setLotNumber(null);
    lotNumberRef.current = null;


    // Nouvelle distribution => nouvelle clé d'idempotence.
    requestIdRef.current = null;
    remainingSnapshotRef.current = Object.fromEntries(remainingById);
    setPreview(capped);
    // Préchargement du générateur Excel pendant que l'utilisateur relit l'aperçu → téléchargement instantané.
    void import("@/services/excel/shipment-fiche-excel").catch(() => undefined);

  };


  const persistShipment = async (): Promise<string | null> => {
    if (preview.length === 0) return null;

    const campaignLabel = normalizeCampaign(getCurrentCampaign());
    const selectedProject = projects.find((p) => p.id === project);

    if (!selectedProject) {
      throw new Error("Projet introuvable dans la liste chargée. Sélectionnez à nouveau le projet puis recalculez la distribution.");
    }

    const invalidDelivery = preview.find((d) => !d.producer_id || Number(d.allocated_weight) <= 0 || Number(d.num_bags) <= 0 || !d.delivery_date || !d.receipt_number);
    if (invalidDelivery) {
      throw new Error(`Distribution invalide pour ${invalidDelivery.full_name || "un producteur"}. Vérifiez le poids, le nombre de sacs, la date et le numéro de reçu.`);
    }


    // Revalidation des dates juste avant enregistrement (aucune date future autorisée)
    const todayIso = new Date().toISOString().slice(0, 10);
    if (startDate > todayIso || endDate > todayIso) {
      throw new Error("Pas possible d'effectuer un chargement avec cette date.");
    }

    // Validation finale des règles métier (potentiel, seuil 50 kg, délai 15 jours, potentiel modifié)
    const anomalies = await validateDistributionBeforeSave(
      selectedCoopId,
      preview.map((d) => ({
        producer_id: d.producer_id,
        full_name: d.full_name,
        allocated_weight: Number(d.allocated_weight),
        delivery_date: d.delivery_date,
      })),
      campaignLabel,
      remainingSnapshotRef.current
    );
    if (anomalies.length > 0) {
      console.error("[CreateShipment] business rules violated", anomalies);
      setSaveDiagnostic(anomalies.join("\n"));
      throw new Error(anomalies.slice(0, 3).join(" "));
    }



    // Clé d'idempotence : identique pour toutes les tentatives d'un même chargement.
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const clientRequestId = requestIdRef.current;

    // Réservation atomique du N° de lot au moment de l'enregistrement uniquement (une seule fois par chargement).
    if (lotNumberRef.current == null) {
      const { data: allocatedLot, error: lotErr } = await supabase.rpc("allocate_lot_number", {
        p_registre: selectedCoopId,
        p_campaign_label: campaignLabel,
      });
      if (lotErr || allocatedLot == null) {
        console.error("[CreateShipment] allocate_lot_number failed", lotErr);
        throw new Error("Numéro de lot indisponible. Une erreur est survenue.");
      }
      lotNumberRef.current = Number(allocatedLot);
      setLotNumber(Number(allocatedLot));
    }

    const shipmentPayload = {
      connaissement: connaissement || null,
      total_weight: Number(totalWeight),
      total_bags: Number(totalBags),
      avg_bag_weight: Number(totalWeight) / Number(totalBags),
      project: selectedProject.name,
      project_id: project || null,
      template_id: templateId || null,
      partner_id: partnerId || null,
      zone: zone || null,
      registre_id: selectedCoopId || null,
      destination,
      campaign_label: campaignLabel,
      lot_number: lotNumberRef.current != null ? String(lotNumberRef.current) : null,
      delivery_start: startDate,
      delivery_end: endDate,
      driver_name: driverName.trim() || null,
      truck_number: truckNumber.trim() || null,
      trailer_number: trailerNumber.trim() || null,
      departure_date: departureDate || null,
      client_request_id: clientRequestId,
    };

    const { data: shipment, error: shipErr } = await supabase
      .from("shipments")
      .insert(shipmentPayload)
      .select("id")
      .single();

    if (shipErr) {
      // Contrainte d'unicité côté base : le chargement a déjà été enregistré (double-clic / double envoi).
      if ((shipErr as { code?: string }).code === "23505") {
        const { data: existing } = await supabase
          .from("shipments")
          .select("id")
          .eq("client_request_id", clientRequestId)
          .maybeSingle();
        if (existing?.id) {
          console.warn("[CreateShipment] duplicate submission ignored", { clientRequestId });
          return existing.id;
        }
      }
      const message = formatTechnicalError(shipErr, "Échec création du chargement");
      console.error("[CreateShipment] shipments insert failed", { error: shipErr, payload: shipmentPayload });
      setSaveDiagnostic(message);
      throw shipErr;
    }

    const deliveries = preview.map((d) => ({
      shipment_id: shipment.id,
      producer_id: d.producer_id,
      receipt_number: d.receipt_number,
      delivery_date: d.delivery_date,
      net_weight: d.allocated_weight,
      num_bags: d.num_bags,
      registre_id: selectedCoopId,
      campaign_label: campaignLabel,
    }));

    const { error: delErr } = await supabase.from("deliveries").insert(deliveries);
    if (delErr) {
      const message = formatTechnicalError(delErr, "Échec création des livraisons");
      console.error("[CreateShipment] deliveries insert failed", { error: delErr, firstDelivery: deliveries[0], count: deliveries.length });
      setSaveDiagnostic(message);
      throw delErr;
    }


    // Mise à jour du potentiel restant : 1 lecture groupée + écritures parallélisées (plus de N+1).
    const producerIds = Array.from(new Set(preview.map((d) => d.producer_id)));
    const { data: producerRows, error: readErr } = await supabase
      .from("producers")
      .select("id, remaining_potential")
      .in("id", producerIds);
    if (readErr) {
      const message = formatTechnicalError(readErr, "Échec lecture du potentiel des producteurs");
      console.error("[CreateShipment] producers read failed", { error: readErr, count: producerIds.length });
      setSaveDiagnostic(message);
      throw readErr;
    }

    const currentById = new Map<string, number>((producerRows || []).map((p) => [p.id, Number(p.remaining_potential) || 0]));
    const allocatedById = new Map<string, number>();
    preview.forEach((d) => {
      allocatedById.set(d.producer_id, (allocatedById.get(d.producer_id) || 0) + Number(d.allocated_weight));
    });

    const updates = Array.from(allocatedById.entries())
      .filter(([id]) => currentById.has(id))
      .map(([id, allocated]) => ({ id, remaining: Math.max(0, (currentById.get(id) ?? 0) - allocated) }));

    const CHUNK = 20;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const results = await Promise.all(
        updates.slice(i, i + CHUNK).map((u) =>
          supabase.from("producers").update({ remaining_potential: u.remaining }).eq("id", u.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        const message = formatTechnicalError(failed.error, "Échec mise à jour du potentiel des producteurs");
        console.error("[CreateShipment] producers update failed", failed.error);
        setSaveDiagnostic(message);
        throw failed.error;
      }
    }


    return shipment.id as string;
  };

  const resetForm = () => {
    setPreview([]);
    setExclusions([]);
    setEditingIndex(null);
    setEditWeight("");
    setEditBags("");
    setSaveDiagnostic(null);
    setPreviewExpanded(false);
    requestIdRef.current = null;
    remainingSnapshotRef.current = {};
    setLotNumber(null);

    setConnaissement("");
    setTotalWeight("");
    setTotalBags("");
    setDriverName("");
    setTruckNumber("");
    setTrailerNumber("");
    setDepartureDate("");
    setProject("");
    setPartnerId("");
    setDestination("");
    setStartDate("");
    setEndDate("");
    setReceiptNumber("");
    // Le registre sélectionné est conservé pour faciliter la saisie de chargements successifs.
    // Ses paramètres (potentiel restant, prochain n° de reçu) doivent être rechargés
    // car l'enregistrement vient de les modifier.
    if (selectedCoopId) {
      const name = cooperatives.find((c) => c.id === selectedCoopId)?.name || zone;
      void loadCoopStats(selectedCoopId, name);
      void loadNextReceiptForCooperative(selectedCoopId);
    }

    // Rafraîchit les listes (historique / détail) si elles sont montées.
    window.dispatchEvent(new CustomEvent("shipment:saved"));


    // Focus cohérent : retour sur le premier champ du formulaire.
    requestAnimationFrame(() => {
      const firstField = document.getElementById("shipment-connaissement");
      firstField?.scrollIntoView({ behavior: "smooth", block: "center" });
      (firstField as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  };




  const addPartner = async () => {
    const name = newPartnerName.trim();
    if (!name) {
      toast({ title: "Nom requis", description: "Renseignez le nom du partenaire.", variant: "destructive" });
      return;
    }
    const coopId =
      cooperatives.find((c) => c.id === selectedCoopId)?.cooperative_id ||
      cooperatives.find((c) => c.cooperative_id)?.cooperative_id;
    if (!coopId) {
      toast({ title: "Coopérative introuvable", description: "Impossible de déterminer la coopérative.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("partners")
      .insert({ name, cooperative_id: coopId })
      .select()
      .single();
    if (error) {
      console.error("[CreateShipment] addPartner failed", error);
      const desc = error.code === "23505"
        ? `Un partenaire nommé « ${name} » existe déjà.`
        : "Une erreur est survenue.";
      toast({ title: "Création impossible", description: desc, variant: "destructive" });
      return;
    }
    setPartners((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setPartnerId(data.id);
    setNewPartnerName("");
    setDialogOpen(false);
    toast({ title: "Partenaire créé", description: `« ${data.name} » ajouté et sélectionné.` });
  };

  const createProject = async () => {
    const name = newProject.name.trim();
    if (!name) {
      toast({ title: "Nom requis", description: "Renseignez un nom de projet.", variant: "destructive" });
      return;
    }
    const dup = projects.find((p) => (p.name || "").toLowerCase() === name.toLowerCase());
    if (dup) {
      toast({ title: "Projet existant", description: `« ${dup.name} » existe déjà — il a été sélectionné.` });
      setProject(dup.id);
      setProjectDialogOpen(false);
      return;
    }
    setCreatingProject(true);
    try {
      const code = newProject.code.trim() || `PRJ-${Date.now().toString(36).toUpperCase()}`;
      // La coopérative est déduite du registre sélectionné, sinon côté serveur (trigger).
      const coopId =
        cooperatives.find((c) => c.id === selectedCoopId)?.cooperative_id ||
        cooperatives.find((c) => c.cooperative_id)?.cooperative_id ||
        undefined;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          ...(coopId ? { cooperative_id: coopId } : {}),
          name,
          code,
          description: newProject.description.trim() || null,
          is_active: newProject.is_active,
        } as Database["public"]["Tables"]["projects"]["Insert"])
        .select("id, name, code, description, is_active, cooperative_id")
        .single();
      if (error) throw error;
      await loadProjects();
      setProject(data.id);
      setProjectDialogOpen(false);
      toast({ title: "Projet créé", description: `« ${data.name} » ajouté et sélectionné.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Création impossible", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditWeight(String(preview[index].allocated_weight));
    setEditBags(String(preview[index].num_bags));
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditWeight("");
    setEditBags("");
  };

  const handleSaveEdit = (index: number) => {
    const newWeight = parseInt(editWeight, 10);
    const newBags = parseInt(editBags, 10);
    if (isNaN(newWeight) || newWeight <= 0 || isNaN(newBags) || newBags <= 0) {
      toast({ title: "Valeurs invalides", variant: "destructive" });
      return;
    }
    if (newWeight / newBags > 90) {
      toast({ title: "Poids par sac trop élevé", description: "Maximum 90 kg par sac.", variant: "destructive" });
      return;
    }

    const updated = [...preview];
    const oldWeight = updated[index].allocated_weight;
    const weightDiff = newWeight - oldWeight;

    updated[index] = { ...updated[index], allocated_weight: newWeight, num_bags: newBags };

    // Redistribute the weight difference across other producers proportionally
    if (weightDiff !== 0 && updated.length > 1) {
      const othersTotal = updated.reduce((s, d, i) => i !== index ? s + d.allocated_weight : s, 0);
      let remaining = -weightDiff;
      for (let i = 0; i < updated.length; i++) {
        if (i === index) continue;
        if (i === updated.length - 1 || (i === updated.length - 2 && index === updated.length - 1)) {
          // Last other producer gets the remainder
          updated[i] = { ...updated[i], allocated_weight: updated[i].allocated_weight + remaining };
          remaining = 0;
        } else {
          const share = Math.round((updated[i].allocated_weight / othersTotal) * (-weightDiff));
          updated[i] = { ...updated[i], allocated_weight: updated[i].allocated_weight + share };
          remaining -= share;
        }
      }
    }

    setPreview(updated);
    setEditingIndex(null);
  };

  /** Unique action finale : validation → enregistrement (une seule fois) → génération → téléchargement. */
  const saveAndDownloadShipment = async () => {
    if (preview.length === 0) return;
    // Verrou synchrone (double-clic rapide) + verrou d'état (rendu UI).
    if (savingRef.current || saving) return;
    savingRef.current = true;
    setSaving(true);
    setSaveDiagnostic(null);
    const count = preview.length;
    let shipmentId: string | null = null;
    try {
      shipmentId = await persistShipment();
    } catch (err) {
      const message = formatTechnicalError(err, "Enregistrement impossible");
      console.error("[CreateShipment] save failed", err);
      setSaveDiagnostic((current) => current || message);
      toast({
        title: "Impossible d'enregistrer le chargement",
        description: "Vérifiez les données et réessayez. Consultez le diagnostic affiché sous l’aperçu.",
        variant: "destructive",
      });
      savingRef.current = false;
      setSaving(false);
      return;
    }

    if (!shipmentId) {
      savingRef.current = false;
      setSaving(false);
      return;
    }

    try {
      const { generateShipmentFiche } = await import("@/services/excel/shipment-fiche-excel");
      await generateShipmentFiche(shipmentId);
      toast({
        title: "Chargement validé et enregistré avec succès.",
        description: `${count} fiches générées et fiche Excel téléchargée. N° chargement : ${shipmentId.slice(0, 8)}.`,
      });
    } catch (err) {
      console.error("[CreateShipment] download failed", err);
      toast({
        title: "Téléchargement échoué",
        description: "Chargement enregistré avec succès, mais le téléchargement du fichier a échoué. Vous pouvez réessayer le téléchargement depuis l’historique.",
        variant: "destructive",
      });
    } finally {
      resetForm();
      savingRef.current = false;
      setSaving(false);
    }
  };


  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Truck}
        title="Chargements"
        description="Créer, suivre et distribuer les chargements de la campagne en cours."
      />

      <Tabs defaultValue="create">
        <TabsList className="bg-muted/50 p-1 rounded-full h-auto flex-wrap">
          <TabsTrigger value="create" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Créer un chargement</TabsTrigger>
          <TabsTrigger value="history" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Historique</TabsTrigger>
          <TabsTrigger value="details" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Détail des chargements</TabsTrigger>
          <TabsTrigger value="import" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Importer les anciens chargements</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="grid gap-6 xl:grid-cols-5 items-start">
            <Card className={`shadow-glass xl:col-span-2 ${previewExpanded ? "hidden" : ""}`}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Truck className="h-4 w-4" /></span>
                  Paramètres du chargement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 1. Registre */}
                <div className="space-y-2">
                  <Label>Registre *</Label>
                  <Select value={selectedCoopId} onValueChange={handleZoneChange}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un registre" /></SelectTrigger>
                    <SelectContent>
                      {cooperatives.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCoopId && (
                  <div className="space-y-2">
                    <Label>Prochain N° Reçu</Label>
                    <Input
                      value={receiptNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setReceiptNumber(val);
                      }}
                      placeholder={suggestedReceipt || "Chargement..."}
                      className="font-mono"
                      maxLength={6}
                    />
                    {suggestedReceipt && (
                      <p className="text-xs text-muted-foreground">
                        Suggestion : <span className="font-mono font-medium">{suggestedReceipt}</span> — modifiable, les suivants seront générés à partir du numéro saisi.
                      </p>
                    )}
                  </div>
                )}

                {selectedCoopStats && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Stats registre — {zone}</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Potentiel</p>
                        <p className="font-semibold">{selectedCoopStats.potentiel.toLocaleString("fr-FR")} kg</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Livré</p>
                        <p className="font-semibold">{selectedCoopStats.delivered.toLocaleString("fr-FR")} kg</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Restant</p>
                        <p className="font-semibold">{selectedCoopStats.remaining.toLocaleString("fr-FR")} kg</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Projet */}
                <div className="space-y-2">
                  <Label>Projet *</Label>
                  <div className="flex gap-2">
                    <Select value={project} onValueChange={setProject}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Sélectionner un projet" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun projet</div>
                        ) : projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canCreateProject && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setNewProject({ name: "", code: "", partner_id: "", description: "", is_active: true });
                          setProjectDialogOpen(true);
                        }}
                      >
                        <FolderPlus className="h-4 w-4 mr-1" /> Nouveau projet
                      </Button>
                    )}
                  </div>
                  {project && (() => {
                    const p = projects.find((x) => x.id === project);
                    if (!p) return null;
                    return (
                      <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-0.5">
                        <div><span className="text-muted-foreground">Nom :</span> <span className="font-medium">{p.name}</span>{p.code ? <span className="font-mono ml-2">[{p.code}]</span> : null}</div>
                        {p.description && <div className="text-muted-foreground italic">{p.description}</div>}
                      </div>
                    );
                  })()}
                </div>

                {/* 3. Partenaire */}
                <div className="space-y-2">
                  <Label>Partenaire *</Label>
                  <div className="flex gap-2">
                    <Select value={partnerId} onValueChange={setPartnerId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>
                        {partners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>

                      <DialogContent>
                        <DialogHeader><DialogTitle>Ajouter un partenaire</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <Input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Nom du partenaire" />
                          <Button onClick={addPartner} className="w-full">Ajouter</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {/* 4. Modèle de chargement */}
                <div className="space-y-2">
                  <Label>Modèle de chargement *</Label>
                  <Select value={templateId} onValueChange={setTemplateId} disabled={!selectedCoopId}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedCoopId ? "Sélectionner un modèle" : "Sélectionnez d'abord un registre"} />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesLoading ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Chargement des modèles…</div>
                      ) : templates.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Aucun modèle de chargement actif n'est disponible pour votre coopérative. Créez ou activez un modèle dans « Modèles de chargement ».
                        </div>
                      ) : templates.map((t) => {
                        const partnerName = partners.find((p) => p.id === t.partner_id)?.name;
                        return (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="flex items-center gap-2">
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              {t.template_name}{partnerName ? ` — ${partnerName}` : ""}{t.is_default ? " ★" : ""}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-0.5">
                      <div><span className="text-muted-foreground">Modèle :</span> <span className="font-medium">{selectedTemplate.template_name}</span></div>
                      {selectedTemplate.partner_id && <div><span className="text-muted-foreground">Partenaire :</span> {partners.find((p) => p.id === selectedTemplate.partner_id)?.name || "—"}</div>}
                      {selectedTemplate.description && <div className="text-muted-foreground italic">{selectedTemplate.description}</div>}
                    </div>
                  )}
                </div>

                {/* 5. Destination & Campagne */}
                <div className="space-y-2">
                  <Label>Destination *</Label>
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Abidjan">Abidjan</SelectItem>
                      <SelectItem value="San-Pedro">San-Pedro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Campagne active</Label>
                  <div className="h-10 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-medium">
                    {getCurrentCampaign()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatique : cycle du 1er septembre au 31 août.
                  </p>
                </div>

                {/* 6. Quantité */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Poids total demandé (kg) *</Label>
                    <Input type="number" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} placeholder="43500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre de sacs *</Label>
                    <Input type="number" value={totalBags} onChange={(e) => setTotalBags(e.target.value)} placeholder="670" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>N° Connaissement *</Label>
                  <Input id="shipment-connaissement" value={connaissement} onChange={(e) => setConnaissement(e.target.value)} placeholder="SC101410-..." />
                </div>

                {/* 7. Distribution (transport + dates) */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Informations transport (obligatoires)</p>
                  <div className="space-y-2">
                    <Label>Nom du chauffeur *</Label>
                    <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="KONATÉ SEYDOU" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>N° Camion *</Label>
                      <Input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="AA886EA04" />
                    </div>
                    <div className="space-y-2">
                      <Label>N° Remorque *</Label>
                      <Input value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} placeholder="8142KT03" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Date départ *</Label>
                    <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date début livraison *</Label>
                    <Input type="date" max={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date fin livraison *</Label>
                    <Input type="date" max={new Date().toISOString().slice(0, 10)} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>


                {missingFields.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Champs requis manquants : {missingFields.join(", ")}.
                  </p>
                )}
                <Button onClick={handleCalculate} className="w-full" disabled={missingFields.length > 0}>
                  Calculer la distribution
                </Button>
              </CardContent>
            </Card>

            <Card className={`shadow-glass ${previewExpanded ? "xl:col-span-5" : "xl:col-span-3"}`}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Download className="h-4 w-4" /></span>
                    Aperçu du chargement
                  </CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden xl:inline-flex"
                      onClick={() => setPreviewExpanded((v) => !v)}
                    >
                      {previewExpanded ? (
                        <><Minimize2 className="h-4 w-4 mr-2" /> Réduire l'aperçu</>
                      ) : (
                        <><Maximize2 className="h-4 w-4 mr-2" /> Agrandir l'aperçu</>
                      )}
                    </Button>
                    {preview.length > 0 && (
                      <Button onClick={saveAndDownloadShipment} disabled={saving}>
                        <Download className="h-4 w-4 mr-2" />
                        {saving ? "Enregistrement et téléchargement..." : "Enregistrer et télécharger"}
                      </Button>
                    )}

                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {exclusions.length > 0 && (
                  <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <p className="font-semibold mb-1">
                      {exclusions.length} producteur(s) exclu(s) par les règles métier
                    </p>
                    <ul className="list-disc pl-5 space-y-1 max-h-48 overflow-auto text-xs">
                      {exclusions.slice(0, 50).map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                    {exclusions.length > 50 && (
                      <p className="text-xs mt-1">… et {exclusions.length - 50} autre(s).</p>
                    )}
                  </div>
                )}
                {preview.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    Remplissez le formulaire et cliquez sur « Calculer la distribution » pour voir l'aperçu.
                  </p>
                ) : (

                  <>
                    <p className="text-sm mb-3">
                      {preview.length} producteurs • {preview.reduce((s, d) => s + d.num_bags, 0)} sacs •{" "}
                      {preview.reduce((s, d) => s + d.allocated_weight, 0).toLocaleString("fr-FR")} kg
                    </p>

                    {saveDiagnostic && (
                      <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        <p className="font-semibold mb-1">Diagnostic technique</p>
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs">{saveDiagnostic}</pre>
                      </div>
                    )}

                    <Tabs defaultValue="template">
                      <TabsList>
                        <TabsTrigger value="template">Aperçu modèle</TabsTrigger>
                        <TabsTrigger value="edit">Édition détaillée</TabsTrigger>
                      </TabsList>

                      <TabsContent value="template">
                        {!selectedTemplate ? (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            Sélectionnez un modèle actif dans « Modèle de chargement » pour afficher l'aperçu.
                          </p>
                        ) : (
                          <div className="max-h-[78vh] overflow-auto">
                            <TemplatePreview
                              title={selectedTemplate.title}
                              subtitle={selectedTemplate.subtitle}
                              slogan={selectedTemplate.slogan}
                              coop_logo_path={selectedTemplate.coop_logo_path}
                              partner_logo_path={selectedTemplate.partner_logo_path}
                              logo_position={selectedTemplate.logo_position}
                              custom_header={selectedTemplate.custom_header}
                              custom_footer={selectedTemplate.custom_footer}
                              show_driver={selectedTemplate.show_driver}
                              show_truck={selectedTemplate.show_truck}
                              show_trailer={selectedTemplate.show_trailer}
                              show_bill_of_lading={selectedTemplate.show_bill_of_lading}
                              show_destination={selectedTemplate.show_destination}
                              show_project={selectedTemplate.show_project}
                              show_partner={selectedTemplate.show_partner}
                              show_departure_date={selectedTemplate.show_departure_date}
                              show_num_bags={selectedTemplate.show_num_bags}
                              show_total_weight={selectedTemplate.show_total_weight}
                              show_num_producers={selectedTemplate.show_num_producers}
                              show_partner_logo={selectedTemplate.show_partner_logo}
                              coopName={cooperatives.find((c) => c.id === selectedCoopId)?.name}
                              data={{
                                driver: driverName || "—",
                                truck: truckNumber || "—",
                                trailer: trailerNumber || "—",
                                bill_of_lading: connaissement || "—",
                                destination: destination || "—",
                                project: projects.find((p) => p.id === project)?.name || "—",
                                partner: partners.find((p) => p.id === partnerId)?.name || "—",
                                departure_date: departureDate || "—",
                                num_bags: preview.reduce((s, d) => s + d.num_bags, 0),
                                total_weight: preview.reduce((s, d) => s + d.allocated_weight, 0).toLocaleString("fr-FR"),
                                num_producers: preview.length,
                                lot: lotNumber != null ? String(lotNumber) : "—",
                                producers: preview.map((d) => ({
                                  name: d.full_name,
                                  receipt: d.receipt_number,
                                  section: d.section,
                                  plant: d.plantation_code,
                                  date: d.delivery_date,
                                  weight: Math.round(d.allocated_weight).toLocaleString("fr-FR"),
                                  bags: d.num_bags,
                                })),
                              } as TemplatePreviewData}
                            />
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="edit">
                        <div className="max-h-[78vh] overflow-auto">
                         <Table>
                             <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">N°</TableHead>
                                <SortableHeader column="receipt" label="N° Reçu" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="name" label="Nom" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="code" label="Code plantation" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="section" label="Section" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="weight" label="Poids (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="bags" label="Sacs" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="date" label="Date" sortConfig={sortConfig} onToggle={toggleSort} />
                                <TableHead className="w-16">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortData(preview, (d, col) => {
                                switch (col) {
                                  case "receipt": return d.receipt_number;
                                  case "name": return d.full_name;
                                  case "code": return d.plantation_code;
                                  case "section": return d.section;
                                  case "weight": return d.allocated_weight;
                                  case "bags": return d.num_bags;
                                  case "date": return d.delivery_date;
                                  default: return null;
                                }
                              }).map((d, index) => {
                                const originalIndex = preview.indexOf(d);
                                return (
                                <TableRow key={d.receipt_number}>
                                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell className="font-mono text-xs">{d.receipt_number}</TableCell>
                                  <TableCell>{d.full_name}</TableCell>
                                  <TableCell className="font-mono text-xs">{d.plantation_code}</TableCell>
                                  <TableCell>{d.section}</TableCell>
                                  {editingIndex === originalIndex ? (
                                    <>
                                      <TableCell>
                                        <Input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="h-7 w-20" />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" value={editBags} onChange={(e) => setEditBags(e.target.value)} className="h-7 w-16" />
                                      </TableCell>
                                    </>
                                  ) : (
                                    <>
                                      <TableCell>{Math.round(d.allocated_weight).toLocaleString("fr-FR")}</TableCell>
                                      <TableCell>{d.num_bags}</TableCell>
                                    </>
                                  )}
                                  <TableCell>{d.delivery_date}</TableCell>
                                  <TableCell>
                                    {editingIndex === originalIndex ? (
                                      <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(originalIndex)}>
                                          <Check className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(originalIndex)}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <ShipmentHistory />
        </TabsContent>

        <TabsContent value="details">
          <ShipmentDetails />
        </TabsContent>

        <TabsContent value="import">
          <ImportShipments />
        </TabsContent>
      </Tabs>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau projet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nom du projet *</Label>
              <Input value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="Ex. Fairtrade 2025" />
            </div>
            <div className="space-y-1.5">
              <Label>Code du projet</Label>
              <Input value={newProject.code} onChange={(e) => setNewProject({ ...newProject, code: e.target.value })} placeholder="Auto si vide" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-sm">Statut actif</Label>
              <input type="checkbox" checked={newProject.is_active} onChange={(e) => setNewProject({ ...newProject, is_active: e.target.checked })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>Annuler</Button>
              <Button onClick={createProject} disabled={creatingProject}>{creatingProject ? "Création..." : "Créer le projet"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

