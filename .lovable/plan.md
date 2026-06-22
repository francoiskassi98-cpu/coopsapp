# Plan — Inscription coopératives & refonte rôles

> Inscription **fermée au public** : seul un `SUPER_ADMIN` peut créer une nouvelle coopérative + son `COOP_ADMIN`. La page `/auth` ne propose que **Connexion** + **Mot de passe oublié** (déjà existants). La création coop+admin se fait depuis une nouvelle page admin `/gestion/cooperatives/nouvelle`.

---

## 1. Migration BD (un seul script, ordre critique)

### 1.1 Enum rôles
- Renommer `app_role` valeurs : `admin` → `super_admin`, `agent` → `agent`, ajout `coop_admin`.
- Postgres ne permet pas le rename direct d'une valeur d'enum utilisée → on crée `app_role_new ('super_admin','coop_admin','agent')`, migre `user_roles.role`, drop ancien enum, rename.
- Mise à jour `has_role()`, `is_admin()` → renommer en `is_super_admin()` + ajout `is_coop_admin(uuid)`.

### 1.2 Table `cooperatives` (ALTER, pas CREATE)
Colonnes nullable ajoutées : `acronym`, `rccm`, `tax_number`, `phone`, `address`, `city`, `country`, `official_email` (unique), `logo_url`, `president_name`, `estimated_producers int`, `certification_type` (enum `fairtrade|rainforest|eudr|ordinaire`), `subscription_status` (enum `trial|active|suspended|expired`), `updated_at`.

### 1.3 Table `user_cooperatives` — migration vers `cooperative_id`
- Ajout colonne `cooperative_id uuid REFERENCES cooperatives(id)`.
- Backfill via `UPDATE … FROM cooperatives WHERE lower(name)=lower(cooperative)`.
- Lignes orphelines : insertion auto dans `cooperatives` puis backfill.
- DROP colonne `cooperative` (texte) une fois OK.
- Refonte `my_cooperative_ids()`, suppression `my_cooperative_names()` (remplacé par join).
- Mise à jour **toutes** les policies RLS qui réfèrent `cooperative` (texte) sur `producers`, `producer_registry`, `shipments`, `deliveries`, `disabled_sections`.

### 1.4 Table `profiles`
Ajout `full_name`, `phone`, `active boolean default true`. (Ne PAS ajouter `role` — reste dans `user_roles`.)
Trigger `handle_new_user` mis à jour : lit `full_name`, `phone` depuis `raw_user_meta_data`, défaut rôle = `agent` (le COOP_ADMIN sera assigné explicitement par l'edge function).

### 1.5 Nouvelle table `subscriptions`
Colonnes : `cooperative_id` (FK), `plan_name`, `amount numeric`, `start_date`, `end_date`, `status` (enum), `payment_date`, `created_by`, timestamps.
RLS : SUPER_ADMIN lecture/écriture totale ; COOP_ADMIN lecture sur sa coop.
GRANT authenticated + service_role.

### 1.6 Storage bucket `cooperative-logos` (privé)
Policies : SUPER_ADMIN write ; lecture authentifiée pour les users de la coop.

---

## 2. Edge Function `create-cooperative` (nouvelle)

Appelée uniquement par SUPER_ADMIN. Vérifie JWT + rôle en DB.

Reçoit : payload coopérative + payload admin (email, full_name, phone, password) + logoBase64 optionnel.

Étapes (transactionnelles côté SQL via RPC `create_cooperative_with_admin`) :
1. Upload logo si fourni → `logo_url`.
2. INSERT `cooperatives` (toutes les colonnes).
3. `supabase.auth.admin.createUser` (email confirmé auto par SUPER_ADMIN, password fourni).
4. UPDATE `profiles` (créé par trigger) : `full_name`, `phone`.
5. UPSERT `user_roles` → `coop_admin`.
6. INSERT `user_cooperatives (user_id, cooperative_id)`.
7. INSERT `subscriptions` : `plan_name='pilote'`, période **1er sept année courante → 30 nov année courante**, `status='trial'`.
8. INSERT `audit_logs` manuel pour traçabilité.

Erreurs → rollback (suppression user auth si étapes suivantes échouent).

Retour : `{ cooperative_id, user_id }`.

---

## 3. Frontend

### 3.1 Nouvelle page `src/pages/CreateCooperative.tsx` (SUPER_ADMIN only, route `/gestion/cooperatives/nouvelle`)
Formulaire multi-étapes (3 steps shadcn) :
- **Étape 1** — Informations coopérative (nom, sigle, RCCM, contribuable, tél, adresse, ville, pays, email, président, nb producteurs, certification select, upload logo)
- **Étape 2** — Administrateur (nom complet, email, tél, mot de passe + confirmation)
- **Étape 3** — Récap + soumission

Validation : `zod` + `react-hook-form`. Règles : email valide, mot de passe ≥8 + maj/min/chiffre, confirmation identique, unicité email vérifiée par l'edge function.

Submit → `supabase.functions.invoke('create-cooperative', …)`. Sur succès : toast + redirection `/gestion`.

### 3.2 Ajout entrée sidebar
Section "Gestion" → lien "Nouvelle coopérative" visible si `super_admin`.

### 3.3 Mise à jour `useAuth.tsx`
- Helper `isSuperAdmin`, `isCoopAdmin`, `isAgent` (remplace `isAdmin` ; on garde un alias `isAdmin = isSuperAdmin || isCoopAdmin` pour ne pas tout casser).
- Lecture coops par join `user_cooperatives → cooperatives`.

### 3.4 `ProtectedRoute`
- Prop `adminOnly` → check `super_admin` (comportement actuel préservé pour /gestion, /audit).
- Nouvelle prop `superAdminOnly`.

### 3.5 Pages existantes
- `UserManagement.tsx`, `AuditLog.tsx`, `Producers.tsx`, `CreateShipment.tsx`, `ExportPage.tsx` : remplacement des références `user_cooperatives.cooperative` (texte) par join `cooperative_id → name`.
- Aucun changement UX visible.

### 3.6 Auth.tsx
Pas de changement majeur (pas d'onglet Inscription — règle confirmée). Ajout d'un message "Pour créer une coopérative, contactez votre administrateur."

---

## 4. Notifications email (différé)
L'envoi automatique d'email de bienvenue nécessite le setup domaine email. Hors scope de cette itération — proposé à la fin une fois le flux validé.

---

## 5. Mise à jour mémoire projet
- Core : rôles `super_admin | coop_admin | agent` (au lieu de `admin | agent`).
- Core : `/gestion/cooperatives/nouvelle` réservée super_admin.
- Nouveau memory file `mem://features/cooperative-onboarding` : flux create-cooperative, abonnement pilote 1 sept→30 nov, RPC transactionnelle.
- Update `mem://auth/rbac-system` et `mem://auth/multi-coop-security`.

---

## 6. Détails techniques

### Ordre d'exécution
1. Migration BD (rôles + cooperatives + user_cooperatives + profiles + subscriptions + bucket + policies + RPC `create_cooperative_with_admin`).
2. Régénération types automatique.
3. Edge function `create-cooperative` + déploiement.
4. Refactor `useAuth` + `ProtectedRoute`.
5. Refactor pages existantes (cooperative_id).
6. Nouvelle page `CreateCooperative.tsx` + route + lien sidebar.
7. Mise à jour `.lovable/plan.md` et mémoire.

### Risques
- Migration `user_cooperatives` : si nom de coop ambigu (doublons casse), backfill peut échouer. Mitigation : `lower()` + log lignes non matchées avant DROP.
- Trigger `handle_new_user` change le rôle par défaut. Vérifier impact sur edge function `create-user` existante.
- Toutes les RLS qui faisaient `EXISTS … cooperative = …` doivent être réécrites.

### Hors scope
- Inscription publique (refusée par règle projet).
- Onglet "Inscription" dans `/auth`.
- Cron expiration abonnement (itération 4 du plan global).
- Emails de bienvenue (nécessite setup domaine).
