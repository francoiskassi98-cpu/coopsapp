
# Plan — Génération du prompt complet du projet (PROJET.md)

## Objectif

Créer un fichier `PROJET.md` à la racine du repo contenant la spécification complète du projet, structurée en sections, optimisée pour être collée dans un nouveau projet Lovable afin de recréer l'application à l'identique.

## Livrable

Un seul fichier : **`PROJET.md`** (~10 pages, Markdown structuré, 100% en français).

## Structure du document

### 1. Contexte & Objectif métier
- Plateforme de gestion des coopératives agricoles cacao (Côte d'Ivoire / Afrique de l'Ouest).
- Modules : producteurs, chargements, livraisons, campagnes, dashboard, reporting PPTX, audit, multi-coopératives SaaS.
- Cible : super_admin (éditeur SaaS), coop_admin (responsable coop), agent (saisie terrain).

### 2. Stack technique
- React 18 + TypeScript + Vite 5
- Tailwind CSS v3 + shadcn/ui
- Supabase (Lovable Cloud) : Postgres, Auth, Storage, Edge Functions
- Recharts (graphiques), PptxGenJS (rapports), ExcelJS (imports/exports — jamais xlsx)
- React Router, TanStack Query, Sonner (toasts)

### 3. Identité visuelle
- Thème sombre : fond `#0A0A0F`, sidebar `#2a004a`
- Accents : turquoise, jaune, rouge corail, menthe
- UI 100% en français, responsive
- Police, tokens sémantiques dans `index.css` (jamais de couleurs en dur)

### 4. Modèle de données (schéma Postgres)
Pour chacune des 15 tables, lister : colonnes principales, FK, contraintes, index.
- `cooperatives` (17 colonnes : name, acronym, rccm, tax_number, phone, address, city, country, official_email, logo_url, president_name, estimated_producers, certification_type, subscription_status, …)
- `profiles` (user_id, username, email, full_name, phone, active)
- `user_roles` (enum `app_role`: super_admin | coop_admin | agent — table séparée pour anti-escalade)
- `user_cooperatives` (user_id, cooperative_id UUID FK)
- `subscriptions` (cooperative_id, plan_name, amount, start_date, end_date, status, payment_date, created_by)
- `campaigns` (libellé YYYY-YYYY, dates strictes 1 sept → 31 août, `utilise_pour_chargement` unique)
- `producers` (full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative, sexe, is_active)
- `producer_registry` (snapshot par campagne, potentiel_livraison/restant)
- `shipments` (cooperative_id, campaign_id, total_weight, num_bags, destination, partner, project, is_cancelled=false toujours)
- `deliveries` (shipment_id, producer_id, receipt_number 6 chiffres, delivery_date, net_weight, num_bags)
- `disabled_sections`, `partners`, `audit_logs`, `reports_ppt_history`, `rapports_envoyes`

### 5. Sécurité & RLS
- Helpers SECURITY DEFINER : `is_super_admin()`, `is_coop_admin()`, `has_role()`, `my_cooperative_ids()`, `my_cooperative_names()`, `is_admin()` (alias)
- Toutes les tables business : RLS scopée par `my_cooperative_ids()` pour coop_admin/agent, accès global pour super_admin
- `user_roles` : lecture authenticated, écriture service_role uniquement
- GRANTs explicites obligatoires sur toutes les tables `public`
- Storage : bucket privé `cooperative-logos` (RLS super_admin pour écriture)
- Auth : inscription publique désactivée, HIBP activé, ProtectedRoute, routes `/gestion` et `/audit` super_admin only

### 6. Edge Functions
- `create-cooperative` : super_admin only, transactionnelle via RPC `create_cooperative_with_admin` (upload logo → coop → admin user → role coop_admin → subscription pilote 1 sept → 30 nov)
- `create-user`, `manage-user` : provisioning utilisateurs (super_admin / coop_admin scopé)
- Toutes vérifient JWT + rôle DB

### 7. Modules fonctionnels (avec routes)
Pour chacun : route, rôle requis, composants clés, règles métier.
- **Dashboard** (`/`) — KPIs, filtres date/campagne, projection, top coopératives
- **Producteurs** (`/producteurs`) — CRUD, import Excel, registre par campagne
- **Chargements** (`/chargements/nouveau`) — création manuelle, validation 14j, plafond 110%, plafond potentiel
- **Import chargements historiques** (`/import-chargements`) — bypass contraintes (mode historique)
- **Campagnes** (`/campagnes`) — gestion stricte YYYY-YYYY, une seule active
- **Export** (`/exports`) — modes multiples, pagination contournée via RPC
- **Gestion** (`/gestion`, super_admin) — utilisateurs, coopératives (`/gestion/cooperatives/nouvelle`)
- **Audit** (`/audit`, super_admin) — journal complet via trigger `log_audit`
- **Auth** (`/auth`), **Reset password** (`/reset-password`)

### 8. Règles métier critiques
- Campagne : strictement "YYYY-YYYY", 1 sept → 31 août
- Distribution chargement : règle 40%, plafond moyenne 110%, tri A-Z des sections
- Reçus : numérotation 6 chiffres séquentielle via RPC `get_max_receipt_number`
- 14 jours minimum entre livraisons d'un même producteur
- Pas d'annulation de chargements (jamais)
- Potentiel restant = potentiel_livraison − somme livrée
- Excel : ExcelJS uniquement, jamais xlsx (sécurité)
- Erreurs frontend : message générique "Une erreur est survenue.", détails via `console.error`

### 9. RPCs Postgres principales
- `create_cooperative_with_admin(p_user_id, p_full_name, p_phone, p_coop jsonb)`
- `get_active_campaign()`, `get_dashboard_stats_by_campaign(p_campaign_id)`
- `get_remaining_potential_by_campaign(p_campaign_id)`
- `get_max_receipt_number(p_cooperative_id)`
- `export_all_producers()`, `export_all_deliveries()`
- `handle_new_user()` trigger, `enforce_single_chargement_campaign()` trigger, `log_audit()` trigger

### 10. Audit trail
- Table `audit_logs` : table_name, record_id, action, old_data jsonb, new_data jsonb, changed_by, changed_by_email, cooperative, campaign_id, created_at
- Trigger générique `log_audit()` attaché aux tables business
- Page `/audit` : filtres par utilisateur, table, action, période, coopérative, campagne

### 11. Reporting PPTX
- `pptx-report-generator.ts` : génère présentations par coopérative/campagne
- Historique persistant dans `reports_ppt_history`

### 12. Onboarding coopérative (SaaS)
- Création par super_admin uniquement (formulaire 3 étapes : coop → admin → récap)
- Plan pilote automatique 3 mois (1 sept → 30 nov), statut `trial`
- Logo upload bucket privé

### 13. Conventions de code
- Tokens sémantiques uniquement (jamais `bg-white`, `text-black`)
- Composants shadcn customisés via variants
- `useAuth` expose : `isSuperAdmin`, `isCoopAdmin`, `isAgent`, `isAdmin` (alias), `cooperativeRefs`
- Toutes les routes protégées par `<ProtectedRoute>` avec props `adminOnly` / `superAdminOnly`

### 14. Données seed / configuration initiale
- 1 super_admin créé manuellement
- Enum `app_role`, `certification_type`, `subscription_status` à créer en premier
- Storage bucket `cooperative-logos` (privé)

### 15. Hors scope (à ne pas implémenter)
- Inscription publique
- Annulation de chargements
- Emails transactionnels (nécessite domaine custom)
- Roles stockés sur `profiles` (anti-pattern de sécurité)

## Étapes d'implémentation

1. Créer `PROJET.md` à la racine avec les 15 sections ci-dessus, en détail (~10 pages).
2. Inclure les snippets SQL clés (enums, helpers RLS, RPC `create_cooperative_with_admin`).
3. Inclure l'arborescence des routes et la matrice rôle × route.
4. Vérifier que le document est auto-suffisant pour recréer le projet de zéro dans un nouveau Lovable.

## Aucune autre modification

Aucun changement de code applicatif, de base de données, ou de configuration. Le seul artefact produit est `PROJET.md`.
