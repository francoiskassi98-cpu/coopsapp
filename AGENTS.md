
- Centre géospatial: fichiers dans le bucket privé `geospatial-files` (originals/ et treated/{coop}/{demande}/), accès via RLS sur les tables geospatial_* ; e-mails via la fonction notify-geospatial (idempotente) — isole les coopératives et évite les doublons de notification.
- AI assistant: edge function `ai-assistant` answers with read-only tools using the caller's JWT (RLS scopes data to their cooperative); conversations persist per user in ai_chat_threads/ai_chat_messages — keeps coop isolation without service-role access.
