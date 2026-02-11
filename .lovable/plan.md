

# Application de Gestion des Chargements de Cacao

## Vue d'ensemble
Application web complète en **français** pour automatiser la gestion des expéditions de cacao pour une coopérative. Pas d'authentification requise. Backend avec **Lovable Cloud** (base de données Supabase).

---

## Module 1 — Base de données Producteurs & Plantations

- Page d'**importation Excel** avec drag & drop ou sélection de fichier
- Lecture des colonnes : Coopérative, Nom complet, N° producteur, CNI, Code producteur, Section, Surface cacao totale, Nombre parcelles, Code plantation, Potentiel livraison (Kg), Surface plantation, Latitude, Longitude
- **Validation** à l'import : rejet si données manquantes/invalides, unicité du code plantation
- Affichage des erreurs ligne par ligne avant confirmation
- Table de consultation des producteurs avec recherche et filtres

## Module 2 — Création de Chargement (Automatisation)

- Formulaire de création : poids total demandé, nombre de sacs déclarés, n° connaissement (optionnel), plage de dates de livraison
- Champs supplémentaires en dropdown : Projet (Fairtrade / Rainforest Alliance / Ordinaire), Partenaire (liste modifiable), Zone, Destination (Abidjan / San-Pedro), Campagne (Principale / Intermédiaire)
- **Calcul automatique** : poids moyen par sac, distribution aux producteurs selon leur potentiel restant (déduction 0.15%–0.20%), seuil minimum 50 kg, arrondi des sacs avec total exact
- Aperçu du chargement avant validation
- Sauvegarde et mise à jour des potentiels restants

## Module 3 — Fiches de Livraison & Numéros de Reçu

- Génération automatique des fiches par producteur :connaissement, nom, n° reçu, section, code plantation, date livraison, poids net, nombre de sacs, projet, destination
- **Numéros de reçu** à 6 chiffres, incrémentés automatiquement, reprise au dernier MAX + 1
- **Dates de livraison** réparties chronologiquement, sections triées A–Z

## Module 4 — Gestion des Campagnes

- Campagne du 01/10/AAAA au 30/09/AAAA+1
- Notification au démarrage d'une nouvelle campagne pour mettre à jour les potentiels
- Aucun blocage de l'application

## Module 5 — Export Excel

- Export du chargement avec toutes les colonnes requises (connaissement, nom, reçu, section, code plantation, date, poids, sacs, projet, partenaire, zone, destination, campagne)
- Export au format officiel « Knf-Modèle-FA.xlsx »
- Validation avant export : rejet si producteur absent du registre
- Options d'export : tous les chargements, par connaissement, potentiel restant par producteur

## Module 6 — Annulation de Chargement

- Annulation par n° de connaissement
- Suppression des livraisons liées + restauration du potentiel
- Historique des annulations conservé

## Module 7 — Tableau de Bord (Page d'accueil)

- KPIs : potentiel total estimé, poids total livré, potentiel restant
- Répartition par projet (FT / RA / Ordinaire), par partenaire, par zone
- Historique des chargements avec recherche
- Graphiques visuels (barres et camemberts)

## Architecture technique

- **Frontend** : React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend** : Lovable Cloud (Supabase) pour la base de données
- **Import Excel** : bibliothèque SheetJS (xlsx) côté client
- **Export Excel** : génération côté client avec SheetJS
- **Interface** : entièrement en français

