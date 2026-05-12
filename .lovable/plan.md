# Refonte Multi-Campagnes — Plan

## Vue d'ensemble
Migrer l'application d'une logique mono-campagne (champ texte `campaign` sur `shipments`) vers une **architecture multi-campagnes** centralisée autour d'une nouvelle table `campaigns`. Toutes les données métier (producteurs, chargements, livraisons, potentiels) seront rattachées à une campagne via `campaign_id`. Une seule campagne à la fois est désignée « campagne utilisée pour les chargements ». Les anciennes campagnes restent consultables et exportables, mais ne sont jamais utilisées pour de nouveaux chargements ni dans les calculs de potentiel restant.

La période officielle change : **01 septembre AAAA → 31 août AAAA+1** (au lieu d'octobre→septembre actuel).

---

## 1. Base de données

### Nouvelle table `campaigns`
- `id` (uuid)
- `nom` (text, unique, format `YYYY-YYYY`)
- `date_debut` (date, 01/09/AAAA)
- `date_fin` (date, 31/08/AAAA+1)
- `active` (bool) — campagne visible/utilisable
- `utilise_pour_chargement` (bool) — UNE SEULE à la fois (contrainte via index unique partiel + trigger)
- `archived` (bool)
- `created_at`

### Nouvelle table `producer_registry`
Registre producteurs **par campagne** (remplace l'utilisation directe de `producers` pour les nouveaux imports) :
- `id`, `campaign_id` (FK), `cooperative`, `nom_complet`, `numero_producteur`, `cni`, `code_producteur`, `section`, `surface_cacao_totale`, `code_plantation`, `potentiel_livraison`, `potentiel_restant`, `latitude`, `longitude`, `actif`, `sexe`, `created_at`
- Contrainte unique : `(campaign_id, code_plantation)`

### Modifications tables existantes
- `shipments` : ajouter `campaign_id` (uuid, FK campaigns)
- `disabled_sections` : ajouter `campaign_id`
- Conserver `producers` actuelle pour rétrocompatibilité historique (lecture seule sur l'historique)

### RLS
Toutes les nouvelles tables : RLS activée, policies `authenticated only` (cohérent avec l'existant). Policies admin pour gestion campagnes.

### Trigger
- Trigger sur `campaigns` : si `UPDATE` met `utilise_pour_chargement = true`, désactiver automatiquement les autres
- Trigger : empêcher modification de `date_debut`/`date_fin` après création (sauf admin)

### Fonctions RPC
- `get_active_campaign()` → campagne courante de chargement
- `get_shipments_by_campaign(p_campaign_id uuid)`
- `get_registry_by_campaign(p_campaign_id uuid)`
- `get_dashboard_stats_by_campaign(p_campaign_id uuid)`
- `get_remaining_potential_by_campaign(p_campaign_id uuid)`

### Migration de données
Backfill : créer une campagne par valeur distincte de `shipments.campaign`, lier les `shipments.campaign_id`. Producteurs existants restent dans `producers` (historique global).

---

## 2. Frontend — Nouvelles pages / refontes

### Nouvelle page « Gestion des Campagnes » (admin uniquement)
- Liste des campagnes avec statut (active / utilisée pour chargement / archivée)
- Créer une nouvelle campagne (auto-calcul dates 01/09 → 31/08)
- Activer / désactiver
- Définir comme « campagne utilisée pour les chargements » (badge visible)
- Archiver

### Refonte `ImportProducers` → registre par campagne
- Étape 0 obligatoire : sélectionner une campagne existante OU en créer une
- Si import sur campagne existante : option « remplacer le registre de cette campagne » (DELETE puis bulk INSERT)
- Validation : unicité `code_plantation` **par campagne** (plus globale)
- Insertion dans `producer_registry` avec `campaign_id`

### Refonte `CreateShipment`
- Suppression du champ texte « Campagne » → utilisation auto de la campagne avec `utilise_pour_chargement = true`
- Source des producteurs : `producer_registry` filtré par `campaign_id` actif + `actif = true`
- Calcul potentiel restant basé uniquement sur la campagne active
- Bloquer création si aucune campagne active

### Refonte `Producers` (gestion)
- Sélecteur de campagne en haut
- Affichage du registre de la campagne sélectionnée
- Activer/désactiver producteur ou section **par campagne**

### Refonte `Dashboard` — 2 onglets
- **Onglet 1 — Campagne active** : KPIs, coop, graphiques, historique de la campagne courante
- **Onglet 2 — Historique global** : toutes campagnes, tableau comparatif (Campagne / Potentiel / Livré / Restant), graphiques d'évolution

### Refonte `ExportPage`
- Sélecteur campagne pour chaque export :
  - Chargements : toutes / spécifique / active
  - Registres : active / spécifique / global
  - Potentiel restant : par campagne / par coopérative
- Tous les exports passent par les RPC

### Refonte `ShipmentHistory`
- Filtre par campagne
- Annulation : restaurer le potentiel sur la campagne du chargement

---

## 3. Sécurité (Module 0)
État actuel : **authentification désactivée** (mode démo) suite aux demandes précédentes. Le spec demande explicitement « accès uniquement aux utilisateurs authentifiés » et désactivation de l'accès anon.

**Décision proposée** : conserver le mode démo actuel pour ne pas casser l'usage en cours. Réactiver auth uniquement si vous le confirmez.

---

## 4. Détails techniques
- Realtime activé sur `campaigns`, `shipments`, `producer_registry`, `deliveries`
- Toutes les requêtes utilisent `fetchAllRows` (pagination) ou RPC
- Format campagne strictement `YYYY-YYYY` validé côté front + DB CHECK
- Mise à jour `mem://logic/campaign-cycle` pour refléter le nouveau cycle 01/09 → 31/08

---

## Ordre d'exécution
1. Migration SQL (tables + RPC + triggers + RLS + backfill)
2. Page Gestion des Campagnes
3. Refonte ImportProducers (registre par campagne)
4. Refonte CreateShipment + Producers
5. Refonte Dashboard (2 onglets)
6. Refonte ExportPage + ShipmentHistory
7. Realtime + tests

---

## Questions avant exécution
1. **Sécurité** : réactiver l'authentification + RLS strict (le spec le demande), ou rester en mode démo ?
2. **Cycle** : confirmez-vous le passage de **Oct→Sept** à **Sept→Août** ? Cela contredit la mémoire projet existante.
3. **Données existantes** : les producteurs actuels doivent-ils être migrés vers `producer_registry` sur la campagne active courante, ou rester uniquement dans `producers` comme archive ?
