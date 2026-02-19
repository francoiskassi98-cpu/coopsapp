import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, Leaf, Truck, BarChart3 } from "lucide-react";

type Props = {
  totalPotential: number;
  totalDelivered: number;
  remaining: number;
  shipmentCount: number;
};

export default function KpiCards({ totalPotential, totalDelivered, remaining, shipmentCount }: Props) {
  const deliveryRate = totalPotential > 0 ? (totalDelivered / totalPotential) * 100 : 0;

  const cards = [
    { label: "Potentiel total", value: `${totalPotential.toLocaleString("fr-FR")} kg`, icon: Leaf, iconClass: "text-destructive" },
    { label: "Poids livré total", value: `${totalDelivered.toLocaleString("fr-FR")} kg`, icon: Package, iconClass: "text-primary" },
    { label: "Potentiel restant", value: `${remaining.toLocaleString("fr-FR")} kg`, icon: TrendingUp, iconClass: "text-destructive" },
    { label: "Taux livraison global", value: `${deliveryRate.toFixed(1)}%`, icon: BarChart3, iconClass: "text-primary" },
    { label: "Total chargements", value: shipmentCount.toString(), icon: Truck, iconClass: "text-destructive" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5 sm:grid-cols-2">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
            <c.icon className={`h-4 w-4 ${c.iconClass}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
