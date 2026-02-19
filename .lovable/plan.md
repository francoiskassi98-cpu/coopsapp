# Application de Gestion des Chargements de Cacao

## Vue d'ensemble

Application web complète en **français** pour automatiser la gestion des expéditions de cacao pour une coopérative.

⚠️ L'application contient des données sensibles (producteurs, reçus, livraisons).
Donc l'accès doit être sécurisé avec Supabase Auth + RLS.

Backend avec **Lovable Cloud** (base de données Supabase).

---

## Module 0 — Sécurité & Performance (Obligatoire)

### Sécurité

- Activation de **Row Level Security (RLS)** sur toutes les tables
- Accès uniquement aux utilisateurs authentifiés (agents/admin)
- Rôles :
  - Admin : accès complet
  - Agent : accès limité à sa coopérative
- Désactivation totale de l’accès public (anon)

### Performance & Suppression limite 1000 lignes

- Pagination obligatoire avec `.range()` (pas de `.limit(1000)`)
- Export complet via fonction Supabase RPC (pas de select direct)
- Import massif optimisé (bulk insert)
- Mise à jour rapide avec Supabase Realtime

---

## Module 1 — Base de données Producteurs & Plantations

- Page d'importation Excel avec drag & drop
- Colonnes :
  Coopérative, Nom complet, N° producteur, CNI, Code producteur,
  Section, Surface cacao totale, Code plantation, Potentiel livraison,
  Latitude, Longitude

### Validation import

- Rejet si données manquantes
- Unicité stricte du `code_plantation`
- Affichage erreurs ligne par ligne avant confirmation

### Gestion Active/Inactif

- Activer/Désactiver un producteur
- Désactiver une section entière
- Lors de la création de chargement :
  seuls les producteurs actifs sont utilisés

---

## Module 2 — Création de Chargement (Automatisation)

- Formulaire :
  poids total demandé, sacs déclarés, connaissement, dates livraison

- Dropdowns :
  Projet (FT/RA/Ordinaire), Partenaire, Zone,
  Destination (Abidjan/San-Pedro), Campagne

### Automatisation

- Distribution du poids selon potentiel restant
- Seuil minimum : 50 kg
- Déduction automatique (0.15%–0.20%)
- Arrondi sacs avec total exact
- Aperçu avant validation

---

## Module 3 — Fiches Livraison & Numéros de Reçu

- Génération automatique des fiches producteur
- Colonnes :
  connaissement, nom, numéro reçu, section, code plantation,
  date livraison, poids net, sacs, projet, destination

### Numéro de reçu

- Champ officiel dans shipments : `"numéro_de_recu"`
- Numéros sur 6 chiffres
- Prochain numéro = MAX("numéro_de_recu") + 1 par coopérative
- Champ modifiable manuellement

---

## Module 4 — Gestion des Campagnes

- Campagne du 01/10/AAAA au 30/09/AAAA+1
- Notification nouvelle campagne
- Mise à jour des potentiels sans bloquer l’application

---

## Module 5 — Export Excel (Illimité)

- Export officiel « Knf-Modèle-FA.xlsx »
- Export complet sans limite de lignes grâce à Supabase RPC
- Options :
  - Tous les chargements
  - Par connaissement
  - Potentiel restant par producteur

---

## Module 6 — Annulation de Chargement

- Annulation par connaissement
- Suppression livraisons liées
- Restauration potentiel
- Historique conservé

---

## Module 7 — Tableau de Bord

### KPIs

- Potentiel total estimé
- Poids total livré
- Potentiel restant

### Analyse par coopérative avec détail

- Poids livré par coop
- Potentiel restant par coop

### Graphiques

- Répartition projet / partenaire / zone
- Historique avec recherche

---

## Architecture technique

- Frontend : React + TypeScript + Tailwind + shadcn/ui
- Backend : Supabase via Lovable Cloud
- Import Excel : SheetJS côté client
- Export Excel : SheetJS + RPC Supabase
- Realtime : Mise à jour instantanée
- Interface : 100% français
