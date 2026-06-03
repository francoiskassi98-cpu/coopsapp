# Plan — Renommage onglet + correction filtre période

## 1. Renommer la fonctionnalité

`src/pages/Dashboard.tsx` (ligne 166) :
- `<TabsTrigger value="powerpoint">PowerPoint</TabsTrigger>` → `Rapport campagne`

`src/components/dashboard/ReportGenerator.tsx` :
- Titre carte "Générer un rapport PowerPoint" → "Générer un rapport de campagne"
- Toast de succès reste pertinent (mentionne PowerPoint car c'est le format .pptx généré)

Valeur interne de l'onglet (`"powerpoint"`) inchangée pour ne pas casser l'état des Tabs.

## 2. Corriger le filtre par période

**Cause** : dans `src/hooks/useReportData.ts`, le filtre actuel impose que le chargement soit **entièrement contenu** dans la période :
```ts
shQ = shQ.gte("delivery_start", filters.dateFrom);
shQ = shQ.lte("delivery_end", filters.dateTo);
```
Un chargement qui chevauche partiellement la période est exclu — d'où "aucune donnée" dès qu'on filtre.

**Correctif** : utiliser une logique de **chevauchement** (un chargement est inclus si sa fenêtre de livraison touche la période) :
```ts
if (filters.dateFrom) shQ = shQ.gte("delivery_end", filters.dateFrom);
if (filters.dateTo)   shQ = shQ.lte("delivery_start", filters.dateTo);
```
Cela inclut tout chargement actif au moins un jour pendant la période, ce qui correspond à ce que l'utilisateur attend pour un rapport de campagne sur un intervalle.

## 3. Vérification

- Onglet Dashboard affiche bien "Rapport campagne".
- Sélectionner campagne + une période réelle de livraisons → rapport généré avec données.
- Sans date → comportement inchangé (toute la campagne).

Aucun changement DB, RLS, ni logique métier hors du filtre de période du rapport.
