
- Centre géospatial: fichiers dans le bucket privé `geospatial-files` (originals/ et treated/{coop}/{demande}/), accès via RLS sur les tables geospatial_* ; e-mails via la fonction notify-geospatial (idempotente) — isole les coopératives et évite les doublons de notification.
