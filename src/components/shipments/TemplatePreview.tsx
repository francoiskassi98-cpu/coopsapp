import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

function useSignedImage(value?: string | null, bucket = "shipment-assets") {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) { setUrl(null); return; }
      if (/^https?:\/\//i.test(value) || value.startsWith("data:")) {
        if (!cancelled) setUrl(value);
        return;
      }
      const { data } = await supabase.storage.from(bucket).createSignedUrl(value, 300);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [value, bucket]);
  return url;
}

export interface TemplatePreviewData {
  fournisseur?: string;
  driver?: string;
  truck?: string;
  trailer?: string;
  bill_of_lading?: string;
  destination?: string;
  project?: string;
  partner?: string;
  departure_date?: string;
  num_bags?: string | number;
  total_weight?: string | number;
  num_producers?: string | number;
  lot?: string;
  producers?: Array<{
    name: string;
    receipt: string;
    section: string;
    plant: string;
    date: string;
    weight: string | number;
    bags: number;
  }>;
}

interface TemplatePreviewProps {
  title?: string | null;
  subtitle?: string | null;
  slogan?: string | null;
  coop_logo_path?: string | null;
  partner_logo_path?: string | null;
  logo_position?: "left" | "center" | "right" | "split";
  custom_header?: string | null;
  custom_footer?: string | null;
  show_driver?: boolean;
  show_truck?: boolean;
  show_trailer?: boolean;
  show_bill_of_lading?: boolean;
  show_destination?: boolean;
  show_project?: boolean;
  show_partner?: boolean;
  show_departure_date?: boolean;
  show_num_bags?: boolean;
  show_total_weight?: boolean;
  show_num_producers?: boolean;
  show_partner_logo?: boolean;
  coopName?: string;
  data?: TemplatePreviewData;
}

const defaultSample = {
  fournisseur: "COOPÉRATIVE EXEMPLE",
  driver: "K. Diabaté",
  truck: "AB-1234-CI",
  trailer: "RM-5678",
  bill_of_lading: "BL-2026-0042",
  destination: "Port d'Abidjan",
  project: "RAINFOREST 2026",
  partner: "ETG",
  departure_date: "22/06/2026",
  num_bags: "320",
  total_weight: "20 800",
  num_producers: "47",
  lot: "LOT-0007",
};

const defaultProducers = [
  { name: "KOFFI Jean", receipt: "000123", section: "A", plant: "PL-001", date: "20/06/2026", weight: "1 250", bags: 20 },
  { name: "YAO Marie", receipt: "000124", section: "B", plant: "PL-002", date: "20/06/2026", weight: "980", bags: 15 },
  { name: "TRAORE Paul", receipt: "000125", section: "A", plant: "PL-003", date: "21/06/2026", weight: "1 470", bags: 23 },
];

export function TemplatePreview(props: TemplatePreviewProps) {
  const pos = props.logo_position || "split";
  const coopLogoUrl = useSignedImage(props.coop_logo_path);
  const partnerLogoUrl = useSignedImage(props.partner_logo_path);
  const coopLogo = coopLogoUrl ? (
    <img src={coopLogoUrl} alt="Logo coop" className="h-16 w-16 object-contain bg-white rounded border" />
  ) : (
    <div className="h-16 w-16 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground bg-white">LOGO</div>
  );
  const partnerLogo = props.show_partner_logo ? (
    partnerLogoUrl ? (
      <img src={partnerLogoUrl} alt="Logo partenaire" className="h-16 w-16 object-contain bg-white rounded border" />
    ) : (
      <div className="h-16 w-16 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground bg-white">PARTENAIRE</div>
    )
  ) : null;

  // Construit les lignes d'info en 2 colonnes (gauche / droite) — fidèle au modèle Excel
  type Row = { left?: [string, string]; right?: [string, string] };
  const rows: Row[] = [];
  rows.push({
    left: ["Fournisseur :", props.coopName || sample.fournisseur],
    right: props.show_project ? ["Statut projet :", sample.show_project] : undefined,
  });
  rows.push({
    left: props.show_driver ? ["Nom du Chauffeur :", sample.show_driver] : undefined,
    right: props.show_destination ? ["Destination :", sample.show_destination] : undefined,
  });
  rows.push({
    left: props.show_truck ? ["N° du Camion :", sample.show_truck] : undefined,
    right: props.show_partner ? ["Partenaire :", sample.show_partner] : undefined,
  });
  rows.push({
    left: props.show_trailer ? ["N° de Remorque :", sample.show_trailer] : undefined,
    right: props.show_bill_of_lading ? ["N° de connaissement :", sample.show_bill_of_lading] : undefined,
  });
  rows.push({
    left: ["N° de lot :", sample.lot],
    right: props.show_departure_date ? ["Date de départ :", sample.show_departure_date] : undefined,
  });
  rows.push({
    left: props.show_total_weight ? ["Poids total (Kg) :", sample.show_total_weight] : undefined,
    right: props.show_num_bags ? ["Nombre de sacs :", sample.show_num_bags] : undefined,
  });
  if (props.show_num_producers) {
    rows.push({ left: ["Nombre de producteurs :", sample.show_num_producers] });
  }

  const visibleRows = rows.filter((r) => r.left || r.right);

  const headerLogos = (() => {
    if (pos === "split") {
      return (
        <div className="flex items-center justify-between w-full gap-3">
          <div>{coopLogo}</div>
          <div className="flex-1 text-center">
            <h2 className="text-lg font-bold tracking-wide uppercase">{props.title || "FICHE D'ACCOMPAGNEMENT CAMPAGNE"}</h2>
            {props.subtitle && <p className="text-sm font-medium">{props.subtitle}</p>}
            {props.slogan && <p className="text-xs italic text-gray-600">« {props.slogan} »</p>}
          </div>
          <div>{partnerLogo ?? <div className="w-16" />}</div>
        </div>
      );
    }
    const align = pos === "center" ? "justify-center" : pos === "right" ? "justify-end" : "justify-start";
    return (
      <div className="w-full space-y-2">
        <div className={`flex items-center gap-3 ${align}`}>
          {coopLogo}
          {partnerLogo}
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-wide uppercase">{props.title || "FICHE D'ACCOMPAGNEMENT CAMPAGNE"}</h2>
          {props.subtitle && <p className="text-sm font-medium">{props.subtitle}</p>}
          {props.slogan && <p className="text-xs italic text-gray-600">« {props.slogan} »</p>}
        </div>
      </div>
    );
  })();

  return (
    <div className="rounded-lg border bg-white text-black overflow-hidden shadow-sm">
      <div className="p-4 border-b">{headerLogos}</div>

      {props.custom_header && (
        <div className="px-4 py-2 text-xs whitespace-pre-wrap bg-gray-50 border-b">{props.custom_header}</div>
      )}

      {/* Bloc informations transport — fidèle au modèle Excel (2 colonnes) */}
      <div className="p-4 border-b">
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i}>
                <td className="border px-2 py-1.5 w-[18%] bg-gray-100 font-semibold">{row.left?.[0] ?? ""}</td>
                <td className="border px-2 py-1.5 w-[32%]">{row.left?.[1] ?? ""}</td>
                <td className="border-0 w-[3%]"></td>
                <td className="border px-2 py-1.5 w-[20%] bg-gray-100 font-semibold">{row.right?.[0] ?? ""}</td>
                <td className="border px-2 py-1.5 w-[27%]">{row.right?.[1] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tableau producteurs — toujours présent, structure identique au fichier exporté */}
      <div className="p-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Détail des livraisons producteurs</p>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-green-700 text-white">
              <th className="border px-2 py-1">N°</th>
              <th className="border px-2 py-1 text-left">Nom et Prénoms Planteur</th>
              <th className="border px-2 py-1">N° de reçu</th>
              <th className="border px-2 py-1">Section</th>
              <th className="border px-2 py-1">Code Plantation</th>
              <th className="border px-2 py-1">Date livraison</th>
              <th className="border px-2 py-1">Poids net (Kg)</th>
              <th className="border px-2 py-1">Sacs</th>
            </tr>
          </thead>
          <tbody>
            {producers.map((p, i) => (
              <tr key={i}>
                <td className="border px-2 py-1 text-center">{i + 1}</td>
                <td className="border px-2 py-1">{p.name}</td>
                <td className="border px-2 py-1 text-center">{p.receipt}</td>
                <td className="border px-2 py-1 text-center">{p.section}</td>
                <td className="border px-2 py-1">{p.plant}</td>
                <td className="border px-2 py-1 text-center">{p.date}</td>
                <td className="border px-2 py-1 text-right">{p.weight}</td>
                <td className="border px-2 py-1 text-center">{p.bags}</td>
              </tr>
            ))}
            <tr className="bg-green-50 font-bold">
              <td className="border px-2 py-1 text-right" colSpan={6}>TOTAL</td>
              <td className="border px-2 py-1 text-right">3 700</td>
              <td className="border px-2 py-1 text-center">58</td>
            </tr>
          </tbody>
        </table>
      </div>

      {props.custom_footer && (
        <div className="p-3 border-t text-[11px] whitespace-pre-wrap text-gray-700 bg-gray-50">
          {props.custom_footer}
        </div>
      )}

      <div className="px-4 py-2 border-t flex flex-wrap gap-1 bg-gray-50">
        <Badge variant="secondary" className="text-[10px]">Aperçu fidèle au modèle Excel exporté</Badge>
        <Badge variant="secondary" className="text-[10px]">Logos : {pos}</Badge>
      </div>
    </div>
  );
}
