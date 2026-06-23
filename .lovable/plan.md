# Refonte — Gestion des logos par upload uniquement

## Objectif
Remplacer partout les champs URL manuels par un système d'upload via Supabase Storage (buckets privés), avec un composant réutilisable `<ImageUploader />` et injection physique des logos dans les exports Excel / PPTX.

## 1. Storage — buckets privés

- ✅ `cooperative-logos` (déjà existant, privé)
- ✅ `partner-logos` (déjà existant, privé)
- 🆕 `shipment-assets` (à créer, privé) — pour les logos des modèles de chargement et rapports PPTX
- 🆕 `user-avatars` (à créer, privé) — pour les profils utilisateurs

Policies RLS sur `storage.objects` :
- Lecture : `authenticated` (signed URLs côté client)
- Écriture/MAJ/Suppression : `authenticated`, scopée à `cooperative_id` via path préfixe `<coop_id>/...`

## 2. Schéma base de données (migration)

Renommage des colonnes — `logo_url` → `logo_path` (stocke un path interne au bucket, pas une URL) :

| Table | Avant | Après |
|---|---|---|
| `cooperatives` | `logo_url` | `logo_path` |
| `partners` | `logo_url` | `logo_path` |
| `shipment_excel_templates` | `coop_logo_url`, `partner_logo_url` | `coop_logo_path`, `partner_logo_path` |
| `profiles` | `avatar_url` | `avatar_path` |

Note : on conserve la valeur existante (les anciennes URLs publiques restent lisibles via fallback dans le composant uploader, qui détecte URL vs path).

## 3. Composant frontend réutilisable

`src/components/ui/ImageUploader.tsx`

Props :
```ts
{
  bucket: "cooperative-logos" | "partner-logos" | "shipment-assets" | "user-avatars";
  pathPrefix: string;          // ex: `${coopId}/templates`
  value: string | null;        // path actuel
  onChange: (path: string | null) => void;
  label?: string;
  maxSizeMb?: number;          // défaut 2
  aspect?: "square" | "free";  // défaut square
}
```

Fonctionnalités :
- Drag & drop + sélection fichier
- Validation : PNG / JPG / JPEG / SVG / WEBP, taille max 2 Mo
- Compression auto (canvas resize > 800px) pour PNG/JPG/WEBP
- Aperçu via `createSignedUrl` (60s)
- Remplacement → upsert nouveau path, suppression de l'ancien
- Bouton supprimer → unlink storage + `onChange(null)`
- État loading / erreur clair, message générique côté UI ("Une erreur est survenue."), détails dans `console.error`

## 4. Pages à mettre à jour

- `src/pages/CreateCooperative.tsx` — utilise déjà un upload ; standardiser sur `<ImageUploader />` et `logo_path`
- `src/pages/Partners.tsx` — remplacer le champ URL par `<ImageUploader />`
- `src/pages/ShipmentTemplates.tsx` — remplacer les deux `Input` URL par deux `<ImageUploader />` (coop + partenaire), bucket `shipment-assets`, préfixe `<coop_id>/templates`
- `src/pages/UserManagement.tsx` / profil — `<ImageUploader />` pour avatar
- Dashboard / Rapports PPTX — lire `logo_path` via signed URL

## 5. Exports Excel & PPTX — injection physique

- `src/services/excel/shipment-fiche-excel.ts` — adapter `fetchImage()` :
  - Accepter un `path` interne → générer signed URL (120s) → fetch → ArrayBuffer → `wb.addImage()`
  - Supporter fallback URL legacy pour anciennes données
- `src/lib/pptx-report-generator.ts` — même logique, `addImage({ data: base64 })`
- Aucune référence externe : tout passe par signed URL temporaire le temps du fetch puis bytes embarqués

## 6. Edge functions

- `supabase/functions/create-cooperative/index.ts` — accepter `logo_path` au lieu de `logo_url`
- RPC `create_cooperative_with_admin` — renommer le champ JSON correspondant

## Détails techniques

**Stratégie de path** : `<entity_id>/<filename-timestamp>.<ext>` — un path par entité, déterministe, simplifie le cleanup.

**Compatibilité données existantes** : le composant `<ImageUploader />` détecte si la valeur est une URL complète (legacy) vs un path interne. À l'affichage : URL → utiliser directe ; path → signed URL. À l'upload du nouveau fichier : on stocke toujours un path.

**Migration** : `ALTER TABLE ... RENAME COLUMN logo_url TO logo_path` — préserve les données. Régénération automatique de `src/integrations/supabase/types.ts` après migration.

**Sécurité** : buckets privés + RLS sur `storage.objects` (path doit commencer par un `cooperative_id` accessible à l'utilisateur via `my_cooperative_ids()` ou être super_admin).

## Ordre d'exécution

1. Migration DB (renommage colonnes + création buckets `shipment-assets`, `user-avatars` + policies RLS)
2. Création composant `<ImageUploader />`
3. Mise à jour des pages (Cooperatives, Partners, ShipmentTemplates, Profile)
4. Mise à jour des services Excel/PPTX (lecture path → signed URL → bytes)
5. Mise à jour de l'edge function `create-cooperative`
6. Vérification build + test visuel preview

Voulez-vous que je procède dans cet ordre ? Confirmez et je commence par la migration.
