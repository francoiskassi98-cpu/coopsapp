## Problèmes identifiés

### 1. « Tout l'écran bouge » à chaque clic
Cause : la zone de contenu (`<main>` dans `AppLayout.tsx`) utilise `overflow-y-auto`. Quand on passe d'une page courte à une page longue (ou inversement), la barre de défilement apparaît/disparaît et tout le contenu se décale horizontalement. De plus, la position de défilement n'est pas remise à zéro lors d'un changement de route, ce qui donne l'impression que la page « saute ».

### 2. « Gestion du projet ne passe pas »
La page `/gestion` est protégée par `ProtectedRoute adminOnly`. Si l'utilisateur courant n'a pas le rôle `admin` dans `user_roles`, il est redirigé silencieusement vers `/`. Les logs edge ne montrent aucune erreur sur `manage-user` — donc la page ne s'ouvre tout simplement pas pour ce compte, ou s'ouvre mais sans qu'on en perçoive le résultat parce que le hook `useAuth` initialise `role = null` puis "agent" par défaut avant que la vraie valeur n'arrive (race avec ProtectedRoute).

Dans `useAuth.tsx`, `fetchProfile` est déclenchée via `setTimeout(..., 0)` après `onAuthStateChange`, mais `setLoading(false)` est appelé **avant** que le rôle ne soit résolu. Résultat : `ProtectedRoute` lit `role !== "admin"` (encore `null`) et redirige vers `/` même pour un admin.

## Corrections prévues

### A. Stabiliser la mise en page (fin du « saut »)
- `src/index.css` : ajouter `html { scrollbar-gutter: stable; }` et appliquer la même chose au conteneur scrollable principal pour réserver l'espace de la scrollbar.
- `src/components/AppLayout.tsx` : ajouter `style={{ scrollbarGutter: "stable" }}` (ou classe utilitaire) sur le `<main>`.
- Créer `src/components/ScrollToTop.tsx` qui remet `window.scrollTo(0,0)` et le scroll du `<main>` à 0 à chaque changement de `pathname`.
- Brancher `<ScrollToTop />` dans `src/App.tsx` à l'intérieur de `<BrowserRouter>`.

### B. Réparer l'accès à /gestion
- `src/hooks/useAuth.tsx` : ne passer `loading` à `false` **qu'après** que `fetchProfile` ait terminé (await dans `onAuthStateChange` et dans `getSession().then`). Cela évite que `ProtectedRoute adminOnly` redirige un admin avant que le rôle soit chargé.
- `src/components/ProtectedRoute.tsx` : pendant que `role` est encore `null` mais `session` existe, afficher le loader au lieu de rediriger. Cela protège aussi les cas où le rôle arrive juste après la session.

### C. Vérification après correction
- Aller sur `/`, puis cliquer sur chaque entrée du menu : le contenu ne doit plus bouger horizontalement et la page doit s'ouvrir en haut.
- Avec un compte admin, ouvrir `/gestion` : la page « Gestion du projet » doit se charger (liste des utilisateurs visible).
- Avec un compte agent, `/gestion` reste interdit (redirection vers `/`), comportement attendu.

Aucune modification de schéma DB, de RLS, d'edge function ou de logique métier.
