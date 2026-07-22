import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, PhoneCall } from "lucide-react";

interface Props {
  reason: "expired" | "suspended";
  endDate?: string;
}

export default function SubscriptionBlocked({ reason, endDate }: Props) {
  const title = reason === "expired" ? "Abonnement expiré" : "Coopérative suspendue";
  const description = reason === "expired"
    ? "L'abonnement de votre coopérative a expiré. L'accès aux modules métier a été suspendu."
    : "Votre coopérative est actuellement suspendue. L'accès aux modules métier n'est pas autorisé.";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-6 w-6" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{description}</p>
          {endDate && (
            <p className="text-muted-foreground">
              Date de fin : <strong>{new Date(endDate).toLocaleDateString("fr-FR")}</strong>
            </p>
          )}
          <div className="rounded-md bg-muted/50 p-3 text-muted-foreground flex items-start gap-2">
            <PhoneCall className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Contactez votre administrateur pour renouveler ou réactiver votre abonnement.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
