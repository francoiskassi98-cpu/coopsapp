
## Contexte

La base de données possède déjà les deux entités :
- `cooperatives` (client SaaS) + `user_cooperatives` + `subscriptions`
- `registres` (entité métier) + `user_registres` + fonctions `my_registre_ids()`, `can_access_registre()`, `is_super_admin()`

Les tables métier (`producers`, `shipments`, `deliveries`, `partners`, `producer_registry`, `producer_bonus_*`, `disabled_sections`, `shipment_excel_templates`) ont déjà une colonne `registre_id` reliée à `registres`.

Le travail est donc principalement un **renommage UI + basculement des requêtes** de la coopérative vers le registre, pas une refonte de schéma.

## Périmètre — ce qui change

### 1. Terminologie UI (fr)
Remplacer partout dans les modules métier :
- "Coopérative" → "Registre"
- "coopérative" → "registre"
- "Coopératives" → "Registres"
- icônes/labels de filtres, colonnes de tableaux, entêtes de formulaires, placeholders, toasts

Modules concernés : Dashboard, Producteurs (liste, analytics, primes, import), Chargements (création, historique, détails, import, templates, exports Excel/PDF), Livraisons, Partenaires, Rapports (PPTX, dialog, filtres, générateur), Exports, Recherche globale, Filtres, Audit métier, Corbeille métier.

### 2. Ce qui garde le mot "Coopérative"
- En-tête `CooperativeBanner`
- `/gestion/cooperatives*` (Super Admin) : liste, création, édition, abonnements
- `CreateCooperative`, `CooperativesManagement`, `SubscriptionBlocked`
- Gestion des utilisateurs (rattachement à la coopérative, invitation coop_admin)
- Paramètres de la coopérative
- Dashboard Super Admin (nb coops, abonnements)

### 3. Requêtes & jointures
Basculer les jointures et agrégations métier de `cooperatives` vers `registres` :
- `shipments … cooperatives(name)` → `shipments … registres(name)`
- Filtres `cooperative_id` métier → `registre_id`
- `useReportData`, `Dashboard`, `ProducersAnalytics`, `PrimeProducer`, `ReportGenerator`, `AuditLog`, `ExportPage`, `Trash`, `GlobalSearch`, `ShipmentHistory`, `ImportShipments`, `ImportProducers`, `Partners`, `CreateShipment`, `ShipmentDetails`, `ProducersList`, `dashboard/CoopTable`, `dashboard/CoopPerformance`, `ReportDialog`, `ReportHistory`, `pptx-report-generator`, `shipment-excel-utils`, `prime-excel`, `excel-utils`, `shipment-fiche-excel`.
- Champs texte legacy (`producer_registry.cooperative`, `shipments.cooperative`, etc.) restent en DB pour compatibilité mais ne servent plus au filtrage : on utilise `registre_id` + jointure sur `registres.name`.

### 4. Hook d'accès
- Introduire `useRegistreContext` (miroir de `useCooperativeContext`) qui expose le/les registres visibles selon les droits et remplace l'usage métier de `cooperativeRefs`.
- `useAuth.cooperativeRefs` reste pour la partie SaaS ; ajouter `registreRefs` (issus de `my_registre_ids` + `registres`).
- Composants métier passent à `registreRefs` (sélecteurs, isolation par registre).

### 5. Base de données (migration légère, sans perte)
Aucune suppression. Migration idempotente pour :
- Créer une vue de commodité `public.v_shipments_registre` (optionnel) — sinon utiliser les jointures directes déjà possibles.
- Vérifier les GRANT/POLICY sur `registres`, `user_registres` pour agents multi-registres.
- Ajouter, si manquants, des index sur `registre_id` des tables métier.
- RPCs métier existantes (`get_dashboard_stats_by_registre`, `next_lot_number`, `my_registre_ids`, `can_access_registre`) sont déjà bonnes ; ne rien casser.
- Les libellés en français des enums restent inchangés.

### 6. Utilisateurs
- Coop admin : voit tous les registres de sa coopérative → sélecteur de registre dans les filtres métier.
- Agent : voit uniquement ses registres (`user_registres`) → sélecteur limité à ses affectations.
- Super admin : sélecteur global (tous registres).
- La gestion utilisateurs (`UserManagement`) permet déjà l'affectation via `user_registres` ; renommer les libellés "Coopératives assignées" → "Registres assignés" pour les agents.

## Livrables

1. Migration SQL non destructive (index, éventuelle vue, vérification GRANT/POLICY).
2. Nouveau hook `useRegistreContext` + extension `useAuth` avec `registreRefs`.
3. Renommage UI global dans tous les fichiers listés.
4. Basculement des requêtes métier vers `registres` (jointures, filtres).
5. `CooperativeBanner` inchangé ; ajout d'un sélecteur/label de registre courant si plusieurs registres.

## Hors périmètre

- Aucune suppression de colonne, table, route.
- Aucun changement des flux d'abonnement, création de coop, auth.
- Aucun renommage de fichier interne (les paths restent, on ne renomme que les libellés UI et les jointures).

## Risques

- Volume de fichiers touchés (~35). Risque de casser des filtres si un endroit oublie la bascule ; mitigation : rechercher `cooperatives(name)` et `cooperative_id` restants après le refactor et lister.
- Types Supabase régénérés uniquement si migration ; on limitera la migration au strict nécessaire pour éviter une régénération lourde.

## Validation

- `tsgo` sans nouvelles erreurs.
- Vérification manuelle rapide sur : Dashboard, Chargements > Créer, Producteurs > Liste, Rapports > PPTX, Exports, Filtres.
