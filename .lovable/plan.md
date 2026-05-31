## Simplification du module Rapports PowerPoint

### Objectif
Réduire l'interface de génération à 2 filtres uniquement : **Campagne** et **Période (Du / Au)**. Le rapport généré couvrira automatiquement **tous les éléments** (toutes coopératives accessibles, tous projets, toutes destinations, tous partenaires) de la campagne et de la période choisies.

### Modifications UI — `src/components/dashboard/ReportGenerator.tsx`

Supprimer de l'interface :
- Le bloc **Type de rapport** (radio 5 options)
- Les selects **Projet**, **Destination**, **Partenaire**
- Le bloc **Coopératives** (checkboxes + chargement de la liste)
- Les états React associés (`type`, `project`, `destination`, `partnerId`, `coopSel`, `coopsAll`, `partners`)
- Les chargements `cooperatives` et `partners` du `useEffect`

Conserver :
- Le select **Campagne** (préselectionné sur la campagne `utilise_pour_chargement`)
- Les inputs **Du** / **Au** (date)
- Le bouton **Générer & Télécharger**
- Le composant `ReportHistory`

### Logique de génération

- Un **seul type de rapport** consolidé est produit (on réutilise le builder `campaign` existant qui contient déjà KPIs, évolution mensuelle, projets, destinations, partenaires, coopératives, top sections, échantillon de chargements). Il devient le rapport unique "Rapport de campagne".
- Appel à `loadReportData("campaign", { campaignId, campaignName, cooperatives: [], project: null, destination: null, partnerId: null, dateFrom, dateTo })`.
- `cooperatives: []` => `loadReportData` ne filtre pas par coopérative ; la RLS Supabase restreint déjà automatiquement les données aux coopératives accessibles à l'agent (admin voit tout).
- Insertion dans `reports_ppt_history` avec `type_rapport = 'campaign'`, `cooperatives = []`, `params = { dateFrom, dateTo }`.

### Sécurité (inchangée)
- RLS reste la garantie principale : un agent ne récupère via Supabase que les `shipments` / `producer_registry` de ses coopératives — donc même sans filtre UI, le rapport est automatiquement scopé.
- Messages d'erreur génériques (`toast.error("Une erreur est survenue.")`).

### Hors-périmètre
- Pas de changement DB / migrations.
- Pas de changement à `pptx-report-generator.ts` ni `useReportData.ts`.
- `ReportHistory.tsx` inchangé (affiche tous les types existants).

### Fichier modifié
- `src/components/dashboard/ReportGenerator.tsx` uniquement.
