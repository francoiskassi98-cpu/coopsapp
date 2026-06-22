# Plan — Producteurs Analytics, Prime Producteur & Modèles Excel Chargements

Trois chantiers liés. Je propose une livraison **en 3 phases** pour rester revuable.

## Phase 1 — Backend (migration unique)

Nouvelles tables, toutes avec `cooperative_id uuid` + RLS multi-tenant (super_admin global, coop_admin/agent scopés via `my_cooperative_ids()`).

- `producer_bonus_settings` — config d'un calcul (campagne, période, type `total`/`per_kg`, montant, créateur).
- `producer_bonus_results` — snapshot des primes calculées (producer_id, volume, prime).
- `shipment_excel_templates` — paramétrage du modèle Excel chargement (libellés, toggles de colonnes, position logos, footer).

GRANT `authenticated` + `service_role`, triggers `updated_at`, policies basées sur `is_super_admin() OR cooperative_id = ANY(my_cooperative_ids())`.

## Phase 2 — Module Producteurs Analytics

Remplacer la page `/producteurs` par un **dashboard analytics premium** (les listes/CRUD existantes restent accessibles via onglet).

- `src/pages/Producers.tsx` : refactor → layout à onglets `Vue d'ensemble` / `Liste` / `Prime`.
- `src/components/producers/ProducersAnalytics.tsx` :
  - KPI cards (total, hommes, femmes, % H/F, actifs, potentiel total, livré, restant) avec icônes Lucide, glassmorphism léger (déjà dans la charte), animations `animate-fade-in`/`animate-scale-in`.
  - Filtres : campagne, période, section, coopérative (super_admin uniquement).
  - Graphiques Recharts : Pie H/F, LineChart livraisons, BarChart top sections, BarChart volume par campagne, BarChart actifs.
  - Skeletons via `Skeleton`, responsive grid Tailwind.
- `src/hooks/useProducersAnalytics.ts` : agrégations Supabase (pagination 1000 par page selon la règle large data), memoization.

Pas de Framer Motion installé → j'utilise les animations Tailwind du projet (`animate-fade-in`, `hover-scale`) — équivalent visuel sans dépendance.

## Phase 3 — Prime Producteur + Modèles Excel Chargements

### Prime producteur
- `src/components/producers/PrimeProducer.tsx` (onglet "Prime") :
  - Form : période, campagne, coop, section optionnelle, type prime (montant total / par kg), montant.
  - Calcul côté client à partir des `deliveries` agrégées par producteur sur la période.
  - Tableau récap (N°, Producteur, Section, Volume Kg, Taux, Montant) + total.
  - Bouton "Enregistrer le calcul" → insert dans `producer_bonus_settings` + `producer_bonus_results`.
  - Export `Prime-{NomCoop}-{Periode}.xlsx` via **ExcelJS** (logo coop, titre, tableau stylisé, total, A4 paysage).
- `src/lib/prime-excel.ts` : générateur ExcelJS dédié.

### Modèles Excel Chargements
- `src/pages/ShipmentTemplates.tsx` route `/gestion/modeles-chargement` (super_admin only, `adminOnly`) :
  - Liste des templates par coop, form CRUD : titre, sous-titre, slogan, logos (URL via buckets existants), position logo, toggles colonnes (chauffeur, camion, remorque, connaissement, destination, projet, partenaire, date départ, sacs, poids, nb producteurs), header/footer custom.
- `src/lib/shipment-excel-utils.ts` : adapter le générateur existant pour lire le template actif de la coop (fallback défaut si aucun), respecter toggles colonnes + libellés, A4 paysage, en-tête répété à l'impression, lignes alternées, bordures — calé sur le fichier `FICHIER EXEMPLE.xlsx` fourni.
- Lien dans la sidebar `/gestion`.

## Points techniques

- **ExcelJS** uniquement (jamais `xlsx`) — règle déjà mémorisée.
- **Large data** : pagination 1000 lignes pour les agrégations producteurs/livraisons.
- **Sécurité** : toutes les nouvelles RPC/queries respectent `is_super_admin() OR cooperative_id = ANY(my_cooperative_ids())`. Frontend masque la sélection coop pour les non-super_admin.
- **Erreurs** : toast générique "Une erreur est survenue.", détails via `console.error`.
- **FR** strict pour UI et libellés.

## Ordre d'exécution

1. Migration Phase 1 (validation utilisateur requise).
2. Après types régénérés → Phase 2 (Analytics).
3. Phase 3 (Prime + Modèles Excel).

Confirmes-tu ce découpage ? Si oui, je lance la migration Phase 1.
