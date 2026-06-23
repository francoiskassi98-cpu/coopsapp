## Problème

1. La fiche Excel générée ignore le modèle configuré dans `/gestion/modeles-chargement` (la fonction utilise une mise en page codée en dur).
2. Les champs métier (Chauffeur, Camion, Remorque, N° connaissement, Date départ, etc.) attendus par la fiche ne sont pas saisis lors de la création du chargement, donc ils s'impriment vides.

## Objectif

- Garder le modèle utilisateur de `shipment_excel_templates` et l'utiliser comme moteur de mise en page de la fiche.
- Obliger la saisie des informations manquantes du chargement avant la distribution.

## 1. Données chargement — saisie obligatoire avant distribution

### Migration `shipments`
Ajouter les colonnes manquantes :
- `driver_name text`
- `truck_number text`
- `trailer_number text`
- `departure_date date`

Pas de NOT NULL strict (pour ne pas casser les chargements existants) — la contrainte se fait côté UI.

### `src/pages/CreateShipment.tsx`
- Ajouter en haut du formulaire un bloc « Informations chargement » avec : Chauffeur, N° Camion, N° Remorque, Date départ (`type=date`).
- Le bouton « Distribuer » est désactivé tant que : coopérative, projet, partenaire, destination, poids, sacs, connaissement, chauffeur, camion, remorque, date départ ne sont pas remplis.
- Ces champs sont persistés sur la ligne `shipments` à la création.

### `src/components/ShipmentDetails.tsx`
- Ajouter les 4 champs dans la fenêtre « Modifier le chargement » pour permettre la correction a posteriori.

## 2. Génération fiche pilotée par le modèle

### `src/services/excel/shipment-fiche-excel.ts`
- Charger le modèle applicable :
  1. modèle `is_default = true` de la coopérative du chargement,
  2. sinon premier modèle de la coopérative,
  3. sinon valeurs par défaut (fidèles à FICHIER EXEMPLE.xlsx).
- Appliquer les paramètres du modèle :
  - **Titre ligne 1** : `template.title` (par défaut « FICHE D'ACCOMPAGNEMENT CAMPAGNE »).
  - **Sous-titre / slogan** : ligne fusionnée sous le titre si renseignés.
  - **Logos** (`coop_logo_url`, `partner_logo_url`) téléchargés via `fetch` → `wb.addImage`, positionnés selon `logo_position` (`left` / `center` / `right` / `split`). Partenaire affiché seulement si `show_partner_logo`.
  - **Bloc infos chargement** : chaque ligne (Chauffeur, Camion, Remorque, Connaissement, Destination, Projet, Partenaire, Date départ, Poids, Sacs, Nb producteurs) n'est rendue que si le `show_*` correspondant est `true`. Le bloc se compacte (pas de ligne vide).
  - **En-tête / pied** : `custom_header` et `custom_footer` rendus en ligne fusionnée + `headerFooter.oddHeader`/`oddFooter` Excel.
  - **Tableau producteurs** : structure fixe N°, Nom, Reçu, Section, Code plantation, Date, Poids, Sacs ; ligne TOTAL conservée. Format A4 paysage, bordures, fusions, répétition d'en-tête à l'impression.

### `src/components/shipments/TemplatePreview.tsx`
- Aligner l'aperçu inline sur la nouvelle logique : appliquer les mêmes toggles (`show_*`), afficher sous-titre / slogan / en-tête / pied, position des logos.

### `src/pages/ShipmentTemplates.tsx`
- Ajouter à côté du bouton « Modifier » un bouton « Aperçu Excel » qui appelle la génération avec des données fictives, pour valider la sortie réelle avant de définir le modèle par défaut.

## Hors périmètre de cette itération

- Bucket `shipment-assets` et uploader de logos (déjà couvert par `cooperative-logos` / `partner-logos`).
- Widgets Producteurs sur le Dashboard `/`.
- Historique exports, auto-numérotation reçus, contrôles métier automatiques.

Ces points sont prévus mais traités après validation de ce correctif.

## Notes techniques

- Les logos privés stockés dans `cooperative-logos` / `partner-logos` sont récupérés via `supabase.storage.from(...).createSignedUrl(60)` puis `fetch` → `ArrayBuffer` avant `wb.addImage`. Les URLs déjà signées sont utilisées telles quelles.
- La validation des champs obligatoires dans `CreateShipment` se fait avec un état dérivé `isReady` qui contrôle le `disabled` du bouton et affiche un message d'aide listant les champs manquants.
- Aucun changement RLS — toutes les colonnes ajoutées héritent des policies existantes de `shipments`.
