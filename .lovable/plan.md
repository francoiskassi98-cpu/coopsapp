## Module Rapports PowerPoint Automatiques

Nouveau module complet de génération de présentations `.pptx` professionnelles depuis le Dashboard, respectant strictement la sécurité multi-coopératives (RLS + scoping `useAuth.cooperatives`).

### 1. Base de données (migration)
- Table `reports_ppt_history` : `id`, `user_id`, `type_rapport` (campaign|cooperative|shipments|tracability|eudr), `campaign_id`, `cooperatives text[]`, `file_name`, `params jsonb`, `created_at`.
- RLS : un agent voit/insère uniquement ses propres rapports ; admin voit tout.
- Pas de stockage du fichier sur le bucket (généré et téléchargé côté client) — on garde seulement les métadonnées d'historique.

### 2. UI Dashboard — nouvel onglet "PowerPoint"
- Ajouter un système d'onglets dans `src/pages/Dashboard.tsx` : `Campagne Active | Historique Global | Analyses | Rapports | PowerPoint`.
- L'onglet **PowerPoint** contient le panneau de génération :
  - Sélection du **type de rapport** (5 types, radio).
  - Filtres : **campagne** (select), **coopératives** (multi-checkbox limité à `useAuth.cooperatives` pour agent, toutes pour admin), **projet**, **destination**, **partenaire**, **période**.
  - Boutons : `Générer & Télécharger`, `Envoyer par email` (placeholder — futur).
  - Bandeau "Historique des rapports" listant les `reports_ppt_history` de l'utilisateur (date, type, campagne, coopératives).

### 3. Générateur PPTX (`src/lib/pptx-report-generator.ts`)
- Une fonction par type de rapport :
  - `buildCampaignReport(data)` — couverture, résumé exécutif, KPIs, évolution mensuelle (graphique pptxgenjs), répartition projets, destinations, conclusion auto.
  - `buildCooperativeReport(data)` — vue par coopérative, volumes, top sections, comparaison.
  - `buildShipmentsReport(data)` — nb chargements, destinations, partenaires, projets, connaissements.
  - `buildTracabilityReport(data)` — producteurs, plantations, GPS, anomalies (registres sans CNI / sans GPS).
  - `buildEudrReport(data)` — géolocalisation, producteurs incomplets, surfaces, risques.
- Thème commun : vert cacao (`#2C5F2D`), blanc, gris, accent or. Slides 16:9, typographie cohérente, header/footer avec n° page et "COOPS APP — Campagne XXXX-XXXX".
- Graphiques natifs pptxgenjs (`addChart` LINE / BAR / PIE).
- Commentaires automatiques générés à partir des KPIs (taux progression, alertes seuils).

### 4. Récupération des données
- Hook `useReportData(type, filters)` qui interroge directement les tables via Supabase JS (RLS s'applique automatiquement → un agent ne récupère que ses coopératives).
- Réutilise les RPC existants (`get_dashboard_stats_by_campaign`, `get_remaining_potential_by_campaign`) + requêtes ciblées sur `shipments`, `deliveries`, `producer_registry`, `producers`.

### 5. Sécurité
- RLS côté DB = garantie principale (déjà en place pour toutes les tables sources).
- Côté UI : la liste des coopératives sélectionnables est l'intersection avec `useAuth.cooperatives` pour les agents.
- Toute erreur → toast générique "Une erreur est survenue." + `console.error`.
- Insertion dans `reports_ppt_history` après génération réussie.

### 6. Refactor mineur
- `ReportDialog.tsx` existant (bouton actuel "Rapport") : laissé en place, mais le nouveau module est l'expérience principale.

### Fichiers
**Créés**
- `supabase/migrations/<ts>_reports_ppt_history.sql`
- `src/lib/pptx-report-generator.ts`
- `src/components/dashboard/ReportGenerator.tsx`
- `src/components/dashboard/ReportHistory.tsx`
- `src/hooks/useReportData.ts`

**Modifiés**
- `src/pages/Dashboard.tsx` — ajout système d'onglets + nouvel onglet PowerPoint.
- `src/integrations/supabase/types.ts` — régénéré par la migration.

### Hors-périmètre (à confirmer si tu veux qu'on l'ajoute ensuite)
- Envoi automatique par email (nécessite edge function + service SMTP/Resend).
- Stockage des `.pptx` dans un bucket Storage (taille, coût).
- Les 3 autres onglets (Campagne Active / Historique Global / Analyses / Rapports) — je crée la structure d'onglets mais l'onglet par défaut garde le contenu actuel du Dashboard ; je peux organiser les autres dans une étape suivante.
