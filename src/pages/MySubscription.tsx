import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCooperativeContext } from "@/hooks/useCooperativeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CreditCard, Loader2, Printer, Smartphone } from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface Payment {
  id: string; transaction_id: string; amount_xof: number; period_months: number; status: string;
  payment_method: string | null; invoice_number: string | null; period_start: string | null;
  period_end: string | null; paid_at: string | null; created_at: string;
}

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  paid: { label: "Payé", variant: "default" },
  pending: { label: "En attente", variant: "secondary" },
  failed: { label: "Échoué", variant: "destructive" },
};

export default function MySubscription() {
  const { cooperative, subscription, refetch } = useCooperativeContext();
  const coopId = (cooperative as { id?: string } | null)?.id;
  const [params, setParams] = useSearchParams();
  const [price, setPrice] = useState<{ amount: number; months: number } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!coopId) return;
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("cooperatives").select("subscription_price_xof,subscription_period_months").eq("id", coopId).maybeSingle(),
      supabase.from("subscription_payments").select("*").eq("cooperative_id", coopId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (c) setPrice({ amount: c.subscription_price_xof, months: c.subscription_period_months });
    setPayments((p ?? []) as Payment[]);
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  // Retour du guichet CinetPay : vérification du paiement
  useEffect(() => {
    const tx = params.get("tx");
    if (!tx) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("cinetpay-webhook", { body: { transaction_id: tx } });
      if (error) { console.error(error); toast.error("Une erreur est survenue."); }
      else if (data?.status === "paid") { toast.success("Paiement confirmé. Votre abonnement est prolongé et la facture envoyée par e-mail."); refetch?.(); }
      else if (data?.status === "failed") toast.error("Le paiement a échoué ou a été annulé.");
      else toast.info("Paiement en cours de confirmation. Actualisez dans quelques instants.");
      params.delete("tx"); setParams(params, { replace: true });
      load();
    })();
  }, [params, setParams, load, refetch]);

  const pay = async () => {
    if (!coopId || paying) return;
    setPaying(true);
    const { data, error } = await supabase.functions.invoke("cinetpay-init", {
      body: { cooperative_id: coopId, return_url: `${window.location.origin}/abonnement` },
    });
    if (error || !data?.payment_url) {
      console.error(error, data);
      toast.error(data?.error ?? "Le guichet de paiement est indisponible. Réessayez plus tard.");
      setPaying(false); return;
    }
    window.location.href = data.payment_url;
  };

  const printInvoice = (p: Payment) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const c = cooperative as { name?: string; acronym?: string | null } | null;
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    w.document.write(`<html><head><title>Facture ${esc(p.invoice_number)}</title></head>
<body style="font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#111">
<h1 style="margin:0">FACTURE ${esc(p.invoice_number)}</h1>
<p style="color:#555">Date : ${fmtDate(p.paid_at)} — <strong style="color:#047857">PAYÉE</strong></p>
<p><strong>Client :</strong> ${esc(c?.name)}${c?.acronym ? ` (${esc(c.acronym)})` : ""}</p>
<table style="width:100%;border-collapse:collapse;margin:24px 0">
<tr style="background:#f3f4f6"><th style="text-align:left;padding:8px">Désignation</th><th style="text-align:right;padding:8px">Montant</th></tr>
<tr><td style="padding:8px;border-bottom:1px solid #ddd">Abonnement logiciel Coops App — ${p.period_months} mois<br><small>Du ${fmtDate(p.period_start)} au ${fmtDate(p.period_end)}</small></td>
<td style="padding:8px;text-align:right;border-bottom:1px solid #ddd">${fmt(p.amount_xof)} FCFA</td></tr>
<tr><td style="padding:8px;text-align:right"><strong>Total payé</strong></td><td style="padding:8px;text-align:right"><strong>${fmt(p.amount_xof)} FCFA</strong></td></tr></table>
<p style="color:#555">Moyen de paiement : ${esc(p.payment_method ?? "Mobile Money")}<br>Référence : ${esc(p.transaction_id)}</p>
<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader title="Mon abonnement" description="Payez votre abonnement par Mobile Money et retrouvez vos factures." />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Renouvellement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Montant</p><p className="text-2xl font-semibold">{price ? `${fmt(price.amount)} FCFA` : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Durée</p><p className="text-2xl font-semibold">{price ? `${price.months} mois` : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Fin actuelle</p><p className="text-2xl font-semibold">{fmtDate(subscription?.end_date ?? null)}</p></div>
          </div>
          {price && price.amount > 0 ? (
            <Button onClick={pay} disabled={paying} size="lg">
              {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
              Payer par Mobile Money (Wave, Orange, MTN, Moov)
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Le montant de votre abonnement n'a pas encore été défini. Contactez le support.</p>
          )}
          <p className="text-xs text-muted-foreground">La période payée s'ajoute à la fin de l'abonnement en cours. La facture est envoyée automatiquement par e-mail.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Paiements et factures</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? <p className="text-sm text-muted-foreground">Aucun paiement pour le moment.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Facture</TableHead><TableHead>Montant</TableHead>
                  <TableHead>Période</TableHead><TableHead>Moyen</TableHead><TableHead>Statut</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.paid_at ?? p.created_at)}</TableCell>
                      <TableCell>{p.invoice_number ?? "—"}</TableCell>
                      <TableCell>{fmt(p.amount_xof)} FCFA</TableCell>
                      <TableCell>{p.period_start ? `${fmtDate(p.period_start)} → ${fmtDate(p.period_end)}` : "—"}</TableCell>
                      <TableCell>{p.payment_method ?? "—"}</TableCell>
                      <TableCell><Badge variant={STATUS[p.status]?.variant ?? "secondary"}>{STATUS[p.status]?.label ?? p.status}</Badge></TableCell>
                      <TableCell>{p.status === "paid" && <Button size="sm" variant="outline" onClick={() => printInvoice(p)}><Printer className="h-4 w-4 mr-1" />Facture</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
