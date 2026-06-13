# Plan projet — Vue d'ensemble actuelle

## 1. Identité projet
- Application interne de gestion de coopératives agricoles (FR uniquement).
- Stack : React 18 + Vite 5 + TS 5, Tailwind v3, shadcn/ui, Supabase (Postgres + Auth + Edge Functions), React Router v6, TanStack Query, `exceljs`, `pptxgenjs`.

## 2. Modules fonctionnels actifs
- **Auth** : connexion email/mot de passe, mot de passe oublié (`/reset-password`), inscription publique désactivée, HIBP activé.
- **Dashboard** : KPIs, performance coopératives, filtres, génération rapport PPTX (onglet "Rapport campagne").
- **Producteurs** : liste + import Excel.
- **Chargements** : création manuelle + import historique Excel.
- **Campagnes** (admin) : format strict `YYYY-YYYY`, un seul `utilise_pour_chargement=true`.
- **Export** : Excel multi-formats, pagination 500/req via `fetchAllRows`.
- **Gestion utilisateurs** (admin) : liste, création, édition, suspension, réinitialisation mot de passe, drawer détails + `last_sign_in_at`.

## 3. Sécurité
- Rôles `admin` / `agent` dans table dédiée `user_roles` + fonction `has_role` SECURITY DEFINER.
- Scoping multi-coopératives via `user_cooperatives`.
- RLS sur toutes les tables business, GRANT explicites, RPCs métier en SECURITY INVOKER.
- Routes protégées par `ProtectedRoute` (+ `adminOnly` pour `/campagnes` et `/gestion`).

## 4. Règles métier clés
- Campagne : 1er sept → 31 août.
- Pas d'annulation de chargement.
- 14 jours min entre livraisons, max 110 % du poids moyen, jamais > potentiel producteur (sauf import historique).
- Distribution chargements : règle 40 %, tri A-Z.
- Reçus : séquençage 6 chiffres via RPC.

## 5. Conventions
- UI/contenu strictement français.
- Thème sombre (`#0A0A0F`), sidebar `#2a004a`, accents turquoise / jaune / coral / menthe.
- Tokens CSS sémantiques uniquement, jamais de couleurs hardcodées.
- `exceljs` obligatoire (jamais `xlsx`).
- Footer dynamique : `© {année} {username}`.
- Erreurs front : message générique, détails via `console.error`.

## 6. Edge Functions
- `create-user` : création admin only.
- `manage-user` : actions `list` / `update` / `activate` / `deactivate` / `reset_password`.

## 7. Hors scope / interdits
- Pas de backend custom hors Edge Functions Supabase.
- Pas de modification de `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- Pas de stockage de rôle sur `profiles`.
