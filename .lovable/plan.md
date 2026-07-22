# Plan — Automatisation des campagnes & Gestion des coopératives

## 1. Suppression du module Campagnes

Suppression complète de :
- Menu « Campagnes » dans `AppLayout`
- Pages : `src/pages/Campaigns.tsx`
- Routes dans `App.tsx`
- Hook `useActiveCampaign` / `useCampaigns`
- Références dans `ReportGenerator`, `ExportPage`, `AuditLog`, `PrimeProducer`, `Dashboard`, filtres, etc.
- Politiques RLS et table `campaigns` (via migration : DROP TABLE cascade)
- Colonnes `campaign_id` (remplacées par `campaign_label` déjà présent)

## 2. Fonction système unique de calcul de campagne

**Frontend** (`src/lib/campaign.ts`) :
```ts
export function computeCampaign(date: Date | string): string {
  const d = new Date(date);
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
}
export function currentCampaign(): string { return computeCampaign(new Date()); }
```

**Backend** : la fonction SQL `compute_campaign_label(timestamptz)` existe déjà — la réutiliser partout.

## 3. Injection automatique dans toutes les écritures

- `campaign_label` renseignée automatiquement côté client via `currentCampaign()` avant tout `insert`
- Triggers `BEFORE INSERT` sur `shipments`, `deliveries`, `producers`, `producer_registry`, `producer_bonus_results` : si `campaign_label IS NULL`, remplir avec `compute_campaign_label(now())`
- Suppression de tout champ de saisie campagne dans les formulaires

## 4. Filtrage par campagne (lecture seule)

Nouveau composant `CampaignFilter` qui liste les campagnes distinctes présentes en base (`SELECT DISTINCT campaign_label`) + option « Toutes ». Utilisé dans Dashboard, Rapports, Exports, Historique.

## 5-6. Module Gestion des Coopératives (Super Admin)

Nouveau menu **Administration → Gestion des Coopératives** → `/gestion/cooperatives`

Page unique `src/pages/CooperativesManagement.tsx` :
- Table listant toutes les coopératives + statut abonnement + jours restants
- Actions : Créer, Modifier, Suspendre, Réactiver, Supprimer (si aucune donnée liée), Voir détails, Gérer abonnement

Migration DB :
- Ajout colonnes `cooperatives` : `region`, `manager_name` (responsable), + colonnes existantes conservées
- Table `subscriptions` : déjà présente, ajout `plan_type` si absent
- Statuts abonnement : `trial | active | expired | suspended`
- Fonction `get_subscription_status(cooperative_id) returns text` calculant l'état en temps réel selon dates

## 7. Bandeau d'informations coopérative

Nouveau composant `src/components/CooperativeBanner.tsx` monté dans `AppHeader` :
- Logo + nom + acronyme
- Registre actif
- Badge statut (🟢 Actif / 🟡 Essai / 🔴 Expiré / ⚪ Suspendu)
- Dates début/fin + jours restants
- Type d'abonnement

Nouveau hook `useCooperativeContext()` qui charge la coopérative de l'utilisateur + abonnement courant (realtime).

## 8. Contrôle d'accès selon abonnement

- Hook `useSubscriptionGuard()` retournant `{ blocked, reason }`
- `ProtectedRoute` étendu : si `blocked === true` et route métier, afficher écran `SubscriptionBlocked` avec message clair
- Super Admin non affecté
- Routes admin (`/gestion/*`) restent accessibles pour permettre régularisation

## 9. Tableau de bord Super Admin

Nouvelle page `src/pages/SuperAdminDashboard.tsx` (`/gestion/dashboard`) :
- KPIs : coopératives totales / actives / essai / expirées / suspendues
- Totaux : registres, utilisateurs, producteurs
- Redirection automatique du super_admin vers ce dashboard après login (au lieu de `/gestion/cooperatives/nouvelle`)

## Migrations SQL prévues (une seule migration)

```sql
-- 1. Drop campaigns module
DROP TABLE IF EXISTS public.campaigns CASCADE;

-- 2. Add cooperative fields
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS manager_name text;

-- 3. Triggers auto campaign_label
CREATE OR REPLACE FUNCTION public.set_campaign_label_auto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campaign_label IS NULL THEN
    NEW.campaign_label := public.compute_campaign_label(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ship_camp BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();
-- (idem deliveries, producers, producer_registry, producer_bonus_results)

-- 4. Subscription status function
CREATE OR REPLACE FUNCTION public.get_subscription_status(_coop_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN s.status = 'suspended' THEN 'suspended'
    WHEN s.end_date < CURRENT_DATE THEN 'expired'
    WHEN s.status = 'trial' THEN 'trial'
    ELSE 'active'
  END
  FROM public.subscriptions s
  WHERE s.cooperative_id = _coop_id
  ORDER BY s.end_date DESC NULLS LAST LIMIT 1;
$$;
```

## Fichiers touchés (résumé)

**Créés :** `src/lib/campaign.ts`, `src/components/CooperativeBanner.tsx`, `src/hooks/useCooperativeContext.tsx`, `src/hooks/useSubscriptionGuard.tsx`, `src/pages/CooperativesManagement.tsx`, `src/pages/SuperAdminDashboard.tsx`, `src/components/SubscriptionBlocked.tsx`, `src/components/CampaignFilter.tsx`

**Modifiés :** `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/AppHeader.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/Auth.tsx`, `src/pages/Dashboard.tsx`, `src/components/dashboard/ReportGenerator.tsx`, `src/components/producers/PrimeProducer.tsx`, `src/pages/ExportPage.tsx`, `src/pages/AuditLog.tsx`, `src/pages/CreateShipment.tsx`, `src/pages/ImportShipments.tsx`, `src/pages/ImportProducers.tsx`

**Supprimés :** `src/pages/Campaigns.tsx`, `src/hooks/useActiveCampaign.tsx`

## Points de confirmation

- **Contrainte de suppression coopérative** : bloquer si des `producers`, `shipments` ou `deliveries` y sont rattachés (proposer suspension à la place).
- **Comportement blocage** : abonnement expiré/suspendu → lecture seule autorisée sur Dashboard/Rapports ou blocage total ? Le plan propose blocage total sauf `/gestion/*`.
- Confirmer avant implémentation, puis j'exécute la migration + le code en une passe.
