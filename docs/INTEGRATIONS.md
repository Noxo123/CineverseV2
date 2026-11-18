# Cineverse V2 — guide des intégrations

Ce document distingue les connecteurs réellement implémentés des fournisseurs simplement déclarés dans la configuration. Une variable renseignée ne signifie pas qu'un service est connecté.

## Stockage local — configuration initiale

- Le stockage est local au serveur qui exécute l'API. Aucun service S3, R2 ou CDN n'est requis.
- Variable : `LOCAL_STORAGE_DIR=./storage`. Le chemin relatif est résolu depuis le répertoire de lancement du processus Node ; un chemin absolu est également accepté.
- Le dossier est créé automatiquement au démarrage de l'API et vérifié depuis le panneau d'administration. Le contrôle confirme les droits de lecture et d'écriture. Le processus API doit disposer des droits de lecture/écriture.
- Le dossier de stockage ne doit pas être exposé directement par le serveur web. Les fichiers privés devront être servis par des routes API contrôlées.
- Les sauvegardes du dossier doivent être incluses dans la stratégie de sauvegarde du serveur.

## Films et séries — lecteurs iframe

Cineverse ne stocke pas les fichiers vidéo : il conserve les métadonnées et, pour chaque contenu, une URL de lecteur intégrable.

- Variable : `IFRAME_ALLOWED_HOSTS`, liste de domaines exacts séparés par des virgules.
- Laisser la liste vide tant que les domaines des lecteurs n'ont pas été validés.
- Seules les URL HTTPS et les origines explicitement autorisées doivent être acceptées par l'API.
- Ne jamais accepter une URL iframe fournie librement par un visiteur ni utiliser une URL de lecteur comme source d'autorité sur les droits de diffusion.
- Les lecteurs doivent être intégrés avec `sandbox`, `referrerpolicy`, une politique CSP `frame-src` restrictive et les permissions minimales nécessaires.
- La configuration de la liste des domaines est préparée ; le formulaire d'administration de l'URL du lecteur et le rendu du player restent à implémenter.
- L'utilisation d'un lecteur tiers reste soumise aux droits de diffusion, conditions du fournisseur et règles applicables.

## Connecteurs implémentés

### TMDB — métadonnées
- Variables : `TMDB_API_KEY` (clé v3) ou `TMDB_READ_ACCESS_TOKEN` (jeton v4).
- Test : administration → APIs & fournisseurs → Tester les connexions.
- Recherche serveur : `GET /api/v1/integrations/tmdb/search?q=...&type=movie|tv`.
- Import : administration → Catalogue → importer un résultat. Les entrées sont créées en brouillon.
- TMDB ne donne aucun droit de diffusion. Les images et métadonnées sont soumises aux conditions TMDB.

### Discord OAuth2
- Variables : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`.
- URL de redirection à déclarer dans le portail développeur Discord : `https://VOTRE-API/api/v1/auth/discord/callback`.
- Démarrage : `GET /api/v1/auth/discord`.
- Scopes : `identify email`. L'adresse doit être vérifiée par Discord.
- Le paramètre state est contrôlé et supprimé après le callback.
- Un compte Discord non encore associé peut créer un compte Cineverse. Si l'adresse e-mail existe déjà, la connexion est refusée plutôt que de lier automatiquement deux comptes. La liaison explicite depuis une session connectée reste à développer.

### Stripe — abonnements VIP
- Variables : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_IDS` (liste séparée par des virgules), `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`.
- Création d'une session : `POST /api/v1/billing/checkout` avec un `priceId` autorisé.
- État membre : `GET /api/v1/billing/subscription`.
- Webhook : `POST /api/v1/webhooks/stripe`.
- Événements utilisés : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- La signature est vérifiée sur le corps brut, avec une tolérance temporelle de cinq minutes. Les identifiants d'événements sont dédupliqués.
- Dans Stripe, configurez les événements ci-dessus vers l'URL webhook publique de l'API. Ne passez jamais le secret webhook au frontend.
- Le portail client, remboursements et règles complètes d'avantages VIP restent à développer.

### Resend — e-mails transactionnels
- Variables : `RESEND_API_KEY`, `EMAIL_FROM` (domaine expéditeur vérifié chez Resend).
- Administration → APIs & fournisseurs : saisissez une adresse et lancez « Envoyer un e-mail de test ».
- Le test est réservé aux administrateurs et journalisé.
- Les parcours de vérification d'adresse, mot de passe oublié et notifications automatiques ne sont pas encore branchés.

## Fournisseurs optionnels à terminer

| Fournisseur | Variables | État réel |
|---|---|---|
| Redis | `REDIS_URL` | Configuration reconnue, client/cache/pub-sub/limiteur partagé à développer |
| Sentry | `SENTRY_DSN` | Configuration reconnue, SDK et instrumentation à développer |
| PostHog | `POSTHOG_KEY`, `POSTHOG_HOST` | Configuration reconnue, SDK et consentement analytics à développer |
| PostgreSQL | `DATABASE_URL` | Connexion utilisée par l'API et migrations automatiques |

## Sécurité de configuration

1. Copier `.env.example` vers `.env` sur l'environnement API, jamais dans le dossier public du frontend.
2. Générer un `SESSION_SECRET` aléatoire de 32 octets minimum.
3. Utiliser des clés distinctes pour développement, préproduction et production.
4. Déclarer l'URL de callback Discord et l'URL webhook Stripe exactes.
5. Ne jamais committer `.env`, clés API, jetons OAuth ou secrets webhook.
6. En production, utiliser HTTPS et définir `WEB_ORIGIN` avec l'origine exacte du frontend.
7. Vérifier les états depuis l'administration. « Configuré » signifie que les variables sont présentes ; « Connecté » n'est affiché qu'après un contrôle réel réussi.

## À faire avant ouverture publique

- Ajouter la liaison Discord à un compte e-mail existant depuis une session authentifiée.
- Terminer les flux e-mail de vérification et de récupération de compte.
- Ajouter Redis, Sentry et PostHog avec leurs tests d'intégration.
- Ajouter les champs de lecteur iframe au catalogue, la validation des domaines et le player frontend sécurisé.
- Ajouter des tests d'intégration PostgreSQL, OAuth et Stripe avec environnements sandbox.
- Finaliser le portail Stripe, les offres VIP, les remboursements et les droits d'accès.
- Vérifier les obligations RGPD, consentement analytics, politique de cookies et contrats des sous-traitants.
- N'activer aucun lecteur sans contrat, territoire et fenêtre de droits documentés.
