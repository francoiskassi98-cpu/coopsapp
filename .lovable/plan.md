# Plan — Extension majeure de l'application

Cette mise à jour ajoute 5 modules. Vu l'ampleur, je propose de **livrer en 5 itérations distinctes** plutôt qu'un seul gros lot, pour garder la qualité et permettre vos retours entre chaque étape.

## Ordre d'implémentation proposé

### Itération 1 — Journal d'audit (Priorité Très Haute)
- Migration : table `public.audit_logs` (id, table_name, record_id, action, old_data JSONB, new_data JSONB, changed_by, changed_at, cooperative, campaign_id), GRANT, RLS admin-only en lecture, INSERT via SECURITY DEFINER uniquement.
- Fonction générique `public.log_audit()` + triggers `AFTER INSERT/UPDATE/DELETE` sur : `producers`, `producer_registry`, `shipments`, `deliveries`, `campaigns`, `user_cooperatives`, `profiles`.
- Page admin `/audit` (route protégée `adminOnly`) avec filtres (utilisateur, table, dates, coopérative, campagne), affichage diff old/new (JSON pretty), pagination 500/req via `fetchAllRows`, export Excel via `exceljs`.
- Lien dans la sidebar (admin).

### Itération 2 — Documents producteurs
- Bucket Storage privé `producer-documents`, politiques RLS limitées aux coopératives de l'utilisateur (admin = tout).
- Migration : table `producer_documents` (producer_id FK, document_type enum CNI/contrat/certificat/photo/autre, file_name, file_path, uploaded_by, uploaded_at, campaign_id nullable).
- Drawer "Fiche producteur" enrichi sur `/producteurs` :
  - Infos générales (déjà présentes) + coordonnées GPS si dispo.
  - KPIs livraisons (total, par campagne, restant, nb livraisons, dernière livraison).
  - Histogramme Recharts : volume livré / campagne + comparaison potentiel vs livré.
  - Onglet Documents : upload, liste, téléchargement signé, suppression (avec audit).
- Note : `recharts` à ajouter (`bun add recharts`).

### Itération 3 — Notifications
- Migration : table `notifications` (user_id, type, title, message, is_read, metadata JSONB), RLS user = ses notifs / admin = tout.
- Hook `useNotifications` (TanStack Query + realtime).
- Cloche dans header avec compteur non lues + panneau (Popover).
- Triggers/RPC pour événements internes : nouvelle campagne, campagne expirée, chargement validé, utilisateur créé, rapport généré, potentiel faible (<10 %), compte suspendu.
- Email : reporté à une itération ultérieure (nécessite domaine email — je vous proposerai le setup à ce moment). WhatsApp : architecture seulement (champ `metadata.channels`).

### Itération 4 — Facturation & Abonnements
- Migration : table `subscriptions` (cooperative_id, plan_name, amount, payment_date, start_date, end_date, status enum actif/expiré/suspendu, created_by).
- Fonction `public.is_cooperative_active(coop_id)` SECURITY DEFINER consultée par les policies RLS de `shipments`, `deliveries`, `producers` pour bloquer les écritures si expiré (lecture/export conservés).
- Job pg_cron quotidien : passe `status` à `expiré` et crée des notifications J-30 / J-7 / J0.
- Page admin `/abonnements` : liste, renouveler, suspendre, réactiver.

### Itération 5 — Signature des rapports
- Étendre `pptx-report-generator.ts` :
  - Slide couverture : logo coop (si présent), nom coop, campagne, date/heure, utilisateur, n° rapport unique (`RPT-YYYYMMDD-XXXX`).
  - Footer sur chaque slide : "Rapport généré automatiquement le {date} à {heure} par {user} — Données confidentielles".
- Génération PDF (nouveau) via `jspdf` + `jspdf-autotable` avec en-tête, pied de page, signature visuelle.
- Persistance du n° dans `reports_ppt_history` (colonne `report_number` à ajouter).
- Respect RLS existant (scoping coop + campagne).

## Conventions respectées
- UI/contenu strictement français, thème sombre existant, tokens sémantiques.
- `exceljs` uniquement (jamais `xlsx`).
- RLS + GRANT explicites sur chaque nouvelle table, RPC SECURITY INVOKER sauf audit (DEFINER).
- Pas de modification de `client.ts`, `types.ts`, `.env`, `config.toml`.
- Erreurs front génériques, détails via `console.error`.

## Questions avant de démarrer

1. **On y va dans l'ordre 1→5 (une itération à la fois, je vous montre, vous validez, on enchaîne) ?** C'est ce que je recommande vu la taille.
2. **Itération 2** : ok pour ajouter la dépendance `recharts` ?
3. **Itération 3** : ok pour reporter l'envoi email à plus tard (nécessite configurer un domaine email) et ne livrer que les notifs internes pour l'instant ?
4. **Itération 4** : le blocage automatique doit-il s'appliquer aussi aux **admins** (qui peuvent gérer plusieurs coops) ou seulement aux **agents** de la coopérative expirée ?

Dès votre feu vert, je démarre l'itération 1 (audit).
