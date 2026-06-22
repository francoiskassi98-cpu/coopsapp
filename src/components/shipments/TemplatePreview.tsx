import { Badge } from "@/components/ui/badge";

interface TemplatePreviewProps {
  title?: string | null;
  subtitle?: string | null;
  slogan?: string | null;
  coop_logo_url?: string | null;
  partner_logo_url?: string | null;
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
}

const sampleRow = {
  show_driver: "K. Diabaté",
  show_truck: "AB-1234-CI",
  show_trailer: "RM-5678",
  show_bill_of_lading: "BL-2026-0042",
  show_destination: "Port d'Abidjan",
  show_project: "Rainforest 2026",
  show_partner: "ETG",
  show_departure_date: "22/06/2026",
  show_num_bags: "320",
  show_total_weight: "20 800 kg",
  show_num_producers: "47",
};

const columnLabels: Record<string, string> = {
  show_driver: "Chauffeur",
  show_truck: "Camion",
  show_trailer: "Remorque",
  show_bill_of_lading: "Connaissement",
  show_destination: "Destination",
  show_project: "Projet",
  show_partner: "Partenaire",
  show_departure_date: "Date départ",
  show_num_bags: "Sacs",
  show_total_weight: "Poids total",
  show_num_producers: "Producteurs",
};

export function TemplatePreview(props: TemplatePreviewProps) {
  const pos = props.logo_position || "left";
  const coopLogo = props.coop_logo_url ? (
    <img src={props.coop_logo_url} alt="Logo coop" className="h-14 w-14 object-contain bg-white rounded border" />
  ) : (
    <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">LOGO</div>
  );
  const partnerLogo = props.show_partner_logo ? (
    props.partner_logo_url ? (
      <img src={props.partner_logo_url} alt="Logo partenaire" className="h-14 w-14 object-contain bg-white rounded border" />
    ) : (
      <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">PARTENAIRE</div>
    )
  ) : null;

  const headerLogos = (() => {
    if (pos === "split") {
      return (
        <div className="flex items-center justify-between w-full">
          {coopLogo}
          {partnerLogo ?? <div />}
        </div>
      );
    }
    const align = pos === "center" ? "justify-center" : pos === "right" ? "justify-end" : "justify-start";
    return (
      <div className={`flex items-center gap-3 w-full ${align}`}>
        {coopLogo}
        {partnerLogo}
      </div>
    );
  })();

  const activeCols = Object.keys(columnLabels).filter((k) => (props as any)[k]);

  return (
    <div className="rounded-lg border bg-white text-black overflow-hidden shadow-sm">
      <div className="p-4 border-b space-y-3">
        {headerLogos}
        <div className="text-center space-y-0.5">
          <h2 className="text-lg font-bold tracking-wide uppercase">{props.title || "FICHE DE CHARGEMENT"}</h2>
          {props.subtitle && <p className="text-sm font-medium">{props.subtitle}</p>}
          {props.slogan && <p className="text-xs italic text-gray-600">« {props.slogan} »</p>}
          {props.coopName && <p className="text-xs text-gray-500">{props.coopName}</p>}
        </div>
        {props.custom_header && (
          <div className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-2">{props.custom_header}</div>
        )}
      </div>

      <div className="p-4">
        {activeCols.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Aucune colonne activée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">#</th>
                  {activeCols.map((c) => (
                    <th key={c} className="border px-2 py-1 text-left whitespace-nowrap">{columnLabels[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2].map((i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{i}</td>
                    {activeCols.map((c) => (
                      <td key={c} className="border px-2 py-1 whitespace-nowrap">{(sampleRow as any)[c] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {props.custom_footer && (
        <div className="p-3 border-t text-[11px] whitespace-pre-wrap text-gray-700 bg-gray-50">
          {props.custom_footer}
        </div>
      )}

      <div className="px-4 py-2 border-t flex flex-wrap gap-1 bg-gray-50">
        <Badge variant="secondary" className="text-[10px]">{activeCols.length} colonne(s)</Badge>
        <Badge variant="secondary" className="text-[10px]">Logos : {pos}</Badge>
      </div>
    </div>
  );
}
