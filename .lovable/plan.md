# Plan — AgroServices Digital : paramètres manquants + nouveau design

Objectif : aligner le projet existant sur la spec complète (modèle SaaS multi-coop, EUDR-ready) et appliquer le design system premium (Linear/Stripe/Notion inspired).

---

## 1. Paramètres manquants à intégrer

### a) Coopératives — dates d'abonnement paramétrables
Aujourd'hui `create_cooperative_with_admin` force `start_date = 1er sept` et `end_date = 30 nov`. À rendre dynamique :
- Ajouter `subscription_start_date` et `subscription_end_date` dans le formulaire `CreateCooperative.tsx` (étape abonnement).
- Modifier la RPC `create_cooperative_with_admin` pour accepter ces deux dates en paramètres (avec fallback pilote 3 mois si non fournis).
- Édition coopérative dans `/gestion/cooperatives` : éditer dates, statut (`active`/`trial`/`suspended`), plan.

### b) Module Partenaires (manquant)
- Page `/partenaires` (CRUD).
- Ajouter colonne `logo_url` à `partners` + bucket storage `partner-logos` (privé, RLS coop_admin/super_admin).
- Sélecteur partenaire dans `CreateShipment` affiche logo.
- Logo partenaire injecté dans exports Excel et PPTX.

### c) Lots auto-numérotés `LOT-0001`
- Ajouter colonne `lot_number text` à `shipments` (séquence par coopérative + campagne).
- Génération automatique côté création de chargement (RPC `next_lot_number(coop_id, campaign_id)`).
- Affichage dans fiche, exports, historique.

### d) Audit logs — pages manquantes / déclencheurs
- Vérifier triggers `log_audit()` sur : `cooperatives`, `producers`, `shipments`, `deliveries`, `partners`, `campaigns`, `subscriptions`, `user_roles`, `user_cooperatives`.
- Page `/audit` : filtres (table, utilisateur, coop, date), diff old/new.

### e) Notifications intelligentes
- Hook `useNotifications` : abonnement expire <30j, campagne inactive, chargement incomplet.
- Bell icon dans header avec badge + popover.

### f) Recherche globale (`⌘K`)
- Composant `GlobalSearch` (shadcn Command) : producteurs / coopératives / chargements / partenaires.

### g) Soft delete + corbeille
- Ajouter `deleted_at timestamptz` aux tables métier (`producers`, `shipments`, `partners`, `cooperatives`).
- Vues filtrent `deleted_at IS NULL`. Page corbeille admin.

### h) Journal de connexion
- Table `login_events (user_id, ip, user_agent, occurred_at)`.
- Edge function ou trigger sur signin (via webhook auth).

### i) Dark/Light toggle
- `ThemeProvider` (next-themes pattern) + bouton dans header. Tokens HSL déjà semantic, ajout variant light.

### j) Mobile-first
- Sidebar collapse auto < md, bottom-nav sur `/chargements/nouveau` et `/producteurs` pour usage tablette/terrain.

---

## 2. Nouveau design premium

### Tokens (`src/index.css` + `tailwind.config.ts`)
Remplacer la palette actuelle par :

```
--background: 240 17% 5%       /* #0A0A0F */
--sidebar-bg: 272 100% 14%     /* #2A004A */
--primary: 181 100% 41%        /* #00D2D3 turquoise */
--secondary: 43 100% 70%       /* #FFD166 jaune */
--destructive: 0 100% 71%      /* #FF6B6B */
--success: 158 95% 43%         /* #06D6A0 */
--foreground: 210 40% 98%      /* #F8FAFC */
```

+ gradients (`--gradient-primary`, `--gradient-sidebar`), ombres (`--shadow-glass`, `--shadow-float`), radius `--radius: 0.875rem`.

### Composants visuels premium
- `GlassCard` : `bg-card/60 backdrop-blur-xl border border-white/5 shadow-[var(--shadow-glass)]`.
- `StatCard` flottante avec gradient subtil + sparkline Recharts.
- Skeletons partout (TanStack Query `isPending`).
- Animations Framer Motion : page transitions (`AnimatePresence`), stagger des cards dashboard, hover scale 1.02 sur cartes.
- Tableaux : sticky header, row hover lift, pagination fluide.

### Page Auth refonte (split-screen)
- Gauche : branding AgroServices Digital, logo, slogan, illustration agricole, stats animées (compteurs), citations en rotation.
- Droite : carte glassmorphism — email, password (toggle visibilité), "mot de passe oublié", bouton avec loader, gestion erreurs inline.
- Background : gradient + grain subtil.

### Sidebar refonte
- Fond `#2A004A`, icônes Lucide, sections groupées (Pilotage / Opérations / Administration), badge "PILOTE" sous logo coop, footer user menu avec avatar + rôle.

### Header global
- Breadcrumb + GlobalSearch (`⌘K`) + Notifications bell + Theme toggle + Avatar menu.

### Dashboard refonte
- Grille KPIs (8 cards animées, sparklines).
- 2 graphiques principaux : Évolution tonnage (Area), Performance coop (Bar horizontal).
- Top sections / Top partenaires (cards latérales).
- Filtre campagne + période sticky.

---

## 3. Migrations DB nécessaires

1. `subscriptions` : aucune (dates déjà présentes), juste rendre RPC paramétrable.
2. `partners` : `ADD COLUMN logo_url text`, `ADD COLUMN cooperative_id uuid`, `ADD COLUMN deleted_at timestamptz`.
3. `shipments` : `ADD COLUMN lot_number text`, unique `(cooperative_id, campaign_id, lot_number)`.
4. `cooperatives`, `producers`, `shipments` : `ADD COLUMN deleted_at timestamptz`.
5. `login_events` : nouvelle table + GRANT + RLS (lecture super_admin only).
6. RPC `next_lot_number(p_coop uuid, p_campaign uuid)` SECURITY DEFINER.
7. RPC `create_cooperative_with_admin` : signature étendue `(…, p_sub_start date, p_sub_end date, p_plan text)`.
8. Triggers `log_audit` sur tables manquantes.
9. Bucket storage `partner-logos` (privé) + policies.

---

## 4. Ordre d'implémentation (build)

1. Migrations DB (1 seul appel) + bucket `partner-logos`.
2. Tokens design + utilitaires glass/shadow + Framer Motion installé.
3. Refonte `AppLayout` (sidebar + header + theme + global search + notifications).
4. Refonte `Auth.tsx` split-screen.
5. Refonte `Dashboard` (KPIs animés, graphiques).
6. Module `/partenaires` (CRUD + upload logo).
7. `CreateShipment` : lot_number auto + sélecteur partenaire avec logo.
8. `CreateCooperative` : dates abonnement paramétrables.
9. `/gestion/cooperatives` : édition dates/statut/plan.
10. Exports Excel + PPTX : injection logo partenaire.
11. Soft delete + page corbeille.
12. Journal de connexion + page `/audit/connexions`.

---

## 5. Hors scope (à confirmer plus tard)
- IA prédictive (architecture seulement, pas d'implémentation).
- Mode offline (cache local) — préparation TanStack Query persist seulement.
- Inscription publique — reste fermée (création via super_admin).

---

Confirme et je passe en build. Souhaites-tu que je traite **tout** en une seule passe, ou que je découpe en jalons (ex: jalon 1 = design + auth + dashboard ; jalon 2 = partenaires + lots + dates ; jalon 3 = audit + notif + recherche + soft delete) ?