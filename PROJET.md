# PROJET — Plateforme SaaS de Gestion des Coopératives Cacao

> Spécification complète et auto-suffisante pour recréer ce projet à l'identique dans un nouveau projet Lovable.
> **Langue UI : 100% français.** Tout libellé visible utilisateur doit être en français.

---

## 1. Contexte & Objectif métier

Plateforme SaaS multi-tenant pour la **gestion des coopératives agricoles cacao** (Côte d'Ivoire / Afrique de l'Ouest).

**Modules clés :**
- Gestion des producteurs et de leurs potentiels de livraison
- Chargements (shipments) de cacao vers partenaires/destinations
- Livraisons individuelles avec numérotation de reçus séquentielle
- Campagnes agricoles strictement annuelles (1 sept → 31 août)
- Dashboard avec KPIs, projections et top coopératives
- Reporting PowerPoint (PPTX) par coopérative/campagne
- Journal d'audit complet (qui a modifié quoi, quand, ancienne/nouvelle valeur)
- Onboarding multi-coopératives en mode SaaS avec abonnements

**Personae :**
| Rôle | Description |
|---|---|
| `super_admin` | Éditeur SaaS. Accès global, gère les coopératives et les utilisateurs. |
| `coop_admin` | Administrateur d'une (ou plusieurs) coopérative(s). Gère ses agents et données. |
| `agent` | Saisie terrain (producteurs, chargements, livraisons) sur sa/ses coop(s). |

---

## 2. Stack technique

- **Frontend** : React 18 + TypeScript + Vite 5
- **Styling** : Tailwind CSS v3 + shadcn/ui (composants Radix customisés)
- **Backend** : Lovable Cloud (Supabase) — Postgres 15, Auth, Storage, Edge Functions (Deno)
- **Data fetching** : TanStack Query
- **Routing** : React Router v6
- **Graphiques** : Recharts
- **Rapports** : PptxGenJS
- **Excel** : **ExcelJS uniquement** (jamais `xlsx` — raison sécurité)
- **Notifications** : Sonner (toasts)
- **Icons** : Lucide React

---

## 3. Identité visuelle

- **Thème** : sombre uniquement (pas de toggle clair)
- **Fond principal** : `#0A0A0F`
- **Sidebar** : `#2a004a` (violet profond)
- **Accents** : turquoise, jaune, rouge corail, menthe
- **Typo** : sans-serif moderne (jamais de serif)
- **Layout** : sidebar fixe gauche + zone principale, responsive (collapse mobile)
- **Règle absolue** : couleurs via **tokens sémantiques** dans `src/index.css` et `tailwind.config.ts` uniquement. Interdit : `text-white`, `bg-black`, `bg-[#xxx]` en dur dans les composants.

---

## 4. Modèle de données

### 4.1 Enums Postgres (à créer en premier)

```sql
CREATE TYPE public.app_role AS ENUM ('super_admin', 'coop_admin', 'agent');
CREATE TYPE public.certification_type AS ENUM ('bio', 'fairtrade', 'rainforest', 'utz', 'conventionnel');
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'suspended', 'expired', 'cancelled');
```

### 4.2 Tables (15)

| Table | Rôle | Colonnes domaine clés |
|---|---|---|
| `cooperatives` | Tenant racine | name, acronym, rccm, tax_number, phone, address, city, country, official_email (unique), logo_url, president_name, estimated_producers, certification_type, subscription_status |
| `profiles` | Profil utilisateur lié à `auth.users` | user_id (FK), username, email, full_name, phone, active |
| `user_roles` | **Table séparée** anti-escalade | user_id, role (app_role), UNIQUE(user_id, role) |
| `user_cooperatives` | Lien utilisateur ↔ coop(s) | user_id, cooperative_id (UUID FK) |
| `subscriptions` | Abonnement SaaS par coop | cooperative_id, plan_name, amount, start_date, end_date, status, payment_date, created_by |
| `campaigns` | Campagne agricole | libelle (YYYY-YYYY), date_debut (1 sept), date_fin (31 août), utilise_pour_chargement (bool, **unique = true**) |
| `producers` | Producteur courant | full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative, sexe, is_active |
| `producer_registry` | Snapshot par campagne | producer_id, campaign_id, cooperative, potentiel_livraison, potentiel_restant |
| `shipments` | Chargement | cooperative_id, campaign_id, total_weight, num_bags, destination, partner, project, shipment_date, **is_cancelled = false (toujours)** |
| `deliveries` | Livraison individuelle | shipment_id, producer_id, receipt_number (6 chiffres), delivery_date, net_weight, num_bags |
| `disabled_sections` | Sections désactivées par coop/campagne | cooperative_id, campaign_id, section_name |
| `partners` | Référentiel partenaires | name |
| `audit_logs` | Journal d'audit | table_name, record_id, action, old_data jsonb, new_data jsonb, changed_by, changed_by_email, cooperative, campaign_id |
| `reports_ppt_history` | Historique PPTX | cooperative_id, campaign_id, file_url, generated_by |
| `rapports_envoyes` | Suivi rapports envoyés | destinataire, sujet, date_envoi |

### 4.3 Standard pour toutes les tables `public`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` + trigger `update_updated_at_column()`
- **GRANTs explicites obligatoires** (PostgREST n'accorde rien par défaut sur `public`)

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- anon UNIQUEMENT si une policy autorise lecture anonyme (jamais ici)
```

---

## 5. Sécurité & RLS

### 5.1 Helpers SECURITY DEFINER (search_path = public)

```sql
-- Vérifier rôle
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin') $$;

CREATE FUNCTION public.is_coop_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='coop_admin') $$;

-- Alias pour préserver les anciennes policies adminOnly
CREATE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT public.is_super_admin() $$;

-- Scoping multi-coop
CREATE FUNCTION public.my_cooperative_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(array_agg(cooperative_id), ARRAY[]::uuid[])
    FROM public.user_cooperatives WHERE user_id = auth.uid()
  $$;

CREATE FUNCTION public.my_cooperative_names() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(array_agg(lower(c.name)), ARRAY[]::text[])
    FROM public.user_cooperatives uc
    JOIN public.cooperatives c ON c.id = uc.cooperative_id
    WHERE uc.user_id = auth.uid()
  $$;
```

### 5.2 Patron RLS

- `super_admin` → accès global toutes tables
- `coop_admin` / `agent` → scopé via `cooperative_id = ANY(my_cooperative_ids())`
- `user_roles` : SELECT pour authenticated, INSERT/UPDATE/DELETE service_role uniquement
- `audit_logs` : INSERT trigger, SELECT super_admin only

Exemple `shipments` :
```sql
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access" ON public.shipments
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Scoped by cooperative" ON public.shipments
  FOR ALL TO authenticated
  USING (cooperative_id = ANY(my_cooperative_ids()))
  WITH CHECK (cooperative_id = ANY(my_cooperative_ids()));
```

### 5.3 Storage

- Bucket privé **`cooperative-logos`**
- Policy : `super_admin` peut INSERT/UPDATE/DELETE ; lecture via signed URL générée côté edge function

### 5.4 Auth

- **Inscription publique désactivée** (`signups` off côté config)
- HIBP activé (mots de passe compromis refusés)
- Pas d'auto-confirm email (sauf demande explicite)
- Provider Google configuré si demandé
- `ProtectedRoute` enveloppe toutes les routes sauf `/auth`, `/reset-password`
- Routes `/gestion` et `/audit` : `superAdminOnly`

---

## 6. Edge Functions (Deno)

| Function | Auth requise | Rôle | Description |
|---|---|---|---|
| `create-cooperative` | JWT | super_admin | Upload logo bucket privé → RPC transactionnelle `create_cooperative_with_admin` (coop + admin user + role coop_admin + subscription pilote). Rollback complet en cas d'échec. |
| `create-user` | JWT | super_admin / coop_admin scopé | Provisionne un utilisateur (agent ou coop_admin), assigne `user_cooperatives`. |
| `manage-user` | JWT | super_admin / coop_admin scopé | Suspend (ban_duration), réactive, change rôle, supprime un utilisateur. |

**Règles edge functions :**
- Toujours vérifier JWT + rôle DB côté serveur (jamais se fier au claim seul)
- Utiliser `SUPABASE_SERVICE_ROLE_KEY` (déjà disponible comme secret)
- CORS activé pour le domaine du projet
- Logs : `console.error` uniquement (jamais leak de secrets)

---

## 7. Modules fonctionnels & routes

| Route | Composant | Rôle requis | Description |
|---|---|---|---|
| `/auth` | `Auth.tsx` | public | Connexion. Inscription désactivée, message "Contactez votre administrateur." |
| `/reset-password` | `ResetPassword.tsx` | public | Réinitialisation mot de passe |
| `/` | `Dashboard.tsx` | authenticated | KPIs, filtres date/campagne, projection, top coopératives |
| `/producteurs` | `Producers.tsx` | authenticated scopé | CRUD producteurs, import Excel |
| `/import-producteurs` | `ImportProducers.tsx` | coop_admin+ | Import Excel (ExcelJS), grouping par section |
| `/chargements/nouveau` | `CreateShipment.tsx` | authenticated scopé | Création manuelle d'un chargement avec validations |
| `/import-chargements` | `ImportShipments.tsx` | super_admin | Import historique (bypass contraintes 14j et 110%) |
| `/campagnes` | `Campaigns.tsx` | super_admin | Gestion campagnes YYYY-YYYY |
| `/exports` | `ExportPage.tsx` | authenticated scopé | Exports Excel multi-format |
| `/gestion` | `UserManagement.tsx` | super_admin | Gestion utilisateurs |
| `/gestion/cooperatives/nouvelle` | `CreateCooperative.tsx` | super_admin | Formulaire 3 étapes (coop → admin → récap) |
| `/audit` | `AuditLog.tsx` | super_admin | Journal d'audit avec filtres |

**Matrice rôle × route** :
```text
                       super_admin  coop_admin  agent
/                          ✓           ✓         ✓
/producteurs               ✓           ✓ (scope) ✓ (scope)
/import-producteurs        ✓           ✓         ✗
/chargements/nouveau       ✓           ✓ (scope) ✓ (scope)
/import-chargements        ✓           ✗         ✗
/campagnes                 ✓           ✗         ✗
/exports                   ✓           ✓ (scope) ✓ (scope)
/gestion                   ✓           ✗         ✗
/gestion/cooperatives/…    ✓           ✗         ✗
/audit                     ✓           ✗         ✗
```

---

## 8. Règles métier critiques

1. **Campagne** : strictement `"YYYY-YYYY"`, du **1er septembre au 31 août**. Une seule campagne `utilise_pour_chargement = true` à la fois (enforcé par trigger).
2. **Distribution chargement** : règle des 40% pour répartition, plafond moyenne **110%** du poids moyen par sac, tri **A-Z** des sections.
3. **Reçus de livraison** : numérotation séquentielle **6 chiffres** par coopérative via `get_max_receipt_number(p_cooperative_id)`.
4. **Délai minimum** : **14 jours** entre deux livraisons d'un même producteur (sauf import historique).
5. **Plafond potentiel** : ne jamais excéder le potentiel restant d'un producteur (sauf import historique).
6. **Annulation interdite** : `is_cancelled` reste `false` à vie. Pas de bouton, pas de RPC d'annulation.
7. **Potentiel restant** = `potentiel_livraison − Σ livraisons campagne`.
8. **Excel** : `exceljs` obligatoire. `xlsx` interdit (CVE non patchées).
9. **Erreurs frontend** : afficher uniquement `"Une erreur est survenue."` à l'utilisateur. Détails via `console.error(error)`. Jamais `error.message` dans un toast.
10. **Pagination grosses tables** : utiliser des RPC dédiées (`export_all_*`) qui bypassent la limite PostgREST 1000 lignes, ou paginer par chunks.

---

## 9. RPCs Postgres principales

```sql
-- Transactionnelle : crée coop + assigne admin + crée abonnement pilote
create_cooperative_with_admin(p_user_id uuid, p_full_name text, p_phone text, p_coop jsonb) RETURNS uuid

-- Dashboard
get_active_campaign() RETURNS campaigns
get_dashboard_stats_by_campaign(p_campaign_id uuid)
  RETURNS TABLE(potentiel_total, poids_livre, potentiel_restant, nb_chargements, nb_producteurs)
get_remaining_potential_by_campaign(p_campaign_id uuid)
  RETURNS TABLE(cooperative, potentiel_total, livre, restant)

-- Reçus
get_max_receipt_number(p_cooperative_id uuid) RETURNS text

-- Exports (bypass pagination)
export_all_producers() RETURNS TABLE(...)
export_all_deliveries() RETURNS TABLE(...)
```

**Triggers** :
- `handle_new_user()` sur `auth.users` AFTER INSERT → crée `profiles` + `user_roles` (rôle `agent` par défaut)
- `enforce_single_chargement_campaign()` sur `campaigns` BEFORE INSERT/UPDATE
- `log_audit()` AFTER INSERT/UPDATE/DELETE sur toutes tables business
- `update_updated_at_column()` BEFORE UPDATE sur toutes les tables

### Snippet — `create_cooperative_with_admin`

```sql
CREATE FUNCTION public.create_cooperative_with_admin(
  p_user_id uuid, p_full_name text, p_phone text, p_coop jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coop_id uuid;
  v_year int := EXTRACT(YEAR FROM now());
BEGIN
  INSERT INTO public.cooperatives (
    name, acronym, rccm, tax_number, phone, address, city, country,
    official_email, logo_url, president_name, estimated_producers,
    certification_type, subscription_status
  ) VALUES (
    p_coop->>'name', p_coop->>'acronym', p_coop->>'rccm', p_coop->>'tax_number',
    p_coop->>'phone', p_coop->>'address', p_coop->>'city', p_coop->>'country',
    p_coop->>'official_email', p_coop->>'logo_url', p_coop->>'president_name',
    NULLIF(p_coop->>'estimated_producers','')::integer,
    NULLIF(p_coop->>'certification_type','')::public.certification_type,
    'trial'
  ) RETURNING id INTO v_coop_id;

  UPDATE public.profiles
    SET full_name = COALESCE(p_full_name, full_name),
        phone = COALESCE(p_phone, phone)
    WHERE user_id = p_user_id;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'coop_admin') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'agent';

  INSERT INTO public.user_cooperatives (user_id, cooperative_id)
    VALUES (p_user_id, v_coop_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.subscriptions (
    cooperative_id, plan_name, start_date, end_date, status, created_by
  ) VALUES (
    v_coop_id, 'Pilote',
    make_date(v_year, 9, 1), make_date(v_year, 11, 30),
    'trial', p_user_id
  );

  RETURN v_coop_id;
END $$;
```

---

## 10. Journal d'audit

**Table** : `audit_logs(table_name, record_id, action, old_data jsonb, new_data jsonb, changed_by, changed_by_email, cooperative, campaign_id, created_at)`

**Trigger générique** `log_audit()` attaché à chaque table business via :
```sql
CREATE TRIGGER trg_audit_<table> AFTER INSERT OR UPDATE OR DELETE ON public.<table>
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
```

**Page `/audit`** (`super_admin` only) :
- Filtres : utilisateur, table, action (INSERT/UPDATE/DELETE), période, coopérative, campagne
- Diff visuel old_data ↔ new_data (jsonb)
- Pagination serveur

---

## 11. Reporting PPTX

- `src/lib/pptx-report-generator.ts` : génération via PptxGenJS
- Slides : page de garde (logo coop) → KPIs → graphiques Recharts (rendus en images) → top producteurs → projection campagne
- Persistence : `reports_ppt_history` (file_url vers Storage, généré par qui, quand)
- Téléchargement direct + listing historique

---

## 12. Onboarding coopérative (SaaS)

**Flow** (super_admin uniquement) :
1. `/gestion/cooperatives/nouvelle` — formulaire 3 étapes
   - Étape 1 : infos coopérative (name, acronym, rccm, tax_number, phone, address, city, country, official_email, certification_type, estimated_producers, president_name, logo)
   - Étape 2 : admin principal (email, full_name, phone, mot de passe temporaire)
   - Étape 3 : récap + validation
2. Soumission → edge function `create-cooperative` :
   - Upload logo dans bucket privé
   - `supabase.auth.admin.createUser(email, password)` → récupère `user_id`
   - Appelle RPC `create_cooperative_with_admin(user_id, full_name, phone, coop_jsonb)`
   - Si erreur : rollback (supprime user + logo)
3. Abonnement pilote automatique : plan `'Pilote'`, du **1 sept → 30 nov** année courante, statut `trial`
4. Toast succès → redirige vers `/gestion`

---

## 13. Conventions de code

- **Tokens sémantiques uniquement** dans les classes Tailwind (`bg-background`, `text-foreground`, `bg-card`, etc.). Définis dans `src/index.css` et `tailwind.config.ts`.
- Composants shadcn customisés via variants (`cva`), jamais via override de classes en place d'appel.
- Hook `useAuth` expose :
  ```ts
  { user, session, loading,
    isSuperAdmin, isCoopAdmin, isAgent,
    isAdmin,                  // alias de isSuperAdmin (compat)
    cooperativeRefs,          // [{ id, name }] des coops de l'utilisateur
    signOut }
  ```
- Toutes les routes protégées par `<ProtectedRoute adminOnly? superAdminOnly?>`
- Imports Supabase : `import { supabase } from "@/integrations/supabase/client"` (fichier auto-généré, **jamais** éditer)
- Fichiers auto-générés interdits à modifier : `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`

---

## 14. Seed / configuration initiale

1. Créer les enums (`app_role`, `certification_type`, `subscription_status`)
2. Créer toutes les tables avec GRANTs + RLS
3. Créer les helpers SECURITY DEFINER
4. Créer les triggers (`handle_new_user`, `enforce_single_chargement_campaign`, `log_audit`, `update_updated_at_column`)
5. Créer le bucket `cooperative-logos` (privé) + policies
6. Déployer les edge functions (`create-cooperative`, `create-user`, `manage-user`)
7. Créer manuellement le **premier super_admin** via SQL :
   ```sql
   -- Après création du user via Auth UI
   INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'super_admin');
   DELETE FROM public.user_roles WHERE user_id = '<uuid>' AND role = 'agent';
   ```
8. Créer la campagne courante via UI `/campagnes`

---

## 15. Hors scope (NE PAS implémenter)

- **Inscription publique** — interdit (sécurité). Création utilisateurs via `/gestion` uniquement.
- **Annulation de chargements** — règle métier, jamais d'annulation.
- **Emails transactionnels custom** — nécessite domaine vérifié, demander au user avant.
- **Stockage du rôle dans `profiles`** — anti-pattern d'escalade. Le rôle est **toujours** dans `user_roles`.
- **Librairie `xlsx`** — CVE non patchées. Utiliser `exceljs`.
- **Toggle thème clair/sombre** — projet sombre uniquement.
- **Toast d'erreur exposant `error.message`** — toujours message générique.

---

## Annexe — Arborescence cible

```text
src/
  App.tsx                      # Routes + providers
  main.tsx
  index.css                    # Design tokens HSL
  components/
    AppLayout.tsx              # Sidebar + main
    ProtectedRoute.tsx
    NavLink.tsx
    ShipmentDetails.tsx
    ShipmentHistory.tsx
    dashboard/
      KpiCards.tsx
      CoopPerformance.tsx
      CoopTable.tsx
      DashboardFilters.tsx
      ReportDialog.tsx
      ReportGenerator.tsx
      ReportHistory.tsx
    ui/                        # shadcn (généré)
  hooks/
    useAuth.tsx
    useActiveCampaign.tsx
    useReportData.ts
    useSortableTable.tsx
  lib/
    database-utils.ts
    excel-utils.ts             # ExcelJS wrapper
    shipment-excel-utils.ts
    shipment-utils.ts          # Règle 40%, 110%, tri A-Z
    pptx-report-generator.ts
    utils.ts                   # cn()
  integrations/supabase/       # AUTO — ne pas éditer
    client.ts
    types.ts
  pages/
    Auth.tsx
    ResetPassword.tsx
    Dashboard.tsx
    Producers.tsx
    ImportProducers.tsx
    CreateShipment.tsx
    ImportShipments.tsx
    Campaigns.tsx
    ExportPage.tsx
    UserManagement.tsx
    CreateCooperative.tsx
    AuditLog.tsx
    Index.tsx
    NotFound.tsx
supabase/
  config.toml                  # AUTO
  functions/
    create-cooperative/index.ts
    create-user/index.ts
    manage-user/index.ts
  migrations/                  # Toutes les migrations SQL
```

---

**Fin du document.** Ce prompt est suffisant pour reconstruire le projet à l'identique dans un nouveau Lovable.
