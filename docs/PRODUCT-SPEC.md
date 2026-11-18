# Produit Cineverse V2 — périmètre fonctionnel

## Direction artistique
- Univers cinéma premium, sombre et immersif.
- Palette : fond `#09070A`, rouge velours `#7F1425`, rouge `#A51E34`, accent champagne `#C9A45E`, ivoire `#FFF2E5`.
- Typographies : Playfair Display pour les titres éditoriaux, DM Sans pour l'interface.
- Animations courtes et fluides, états de chargement, transitions de pages et respect de `prefers-reduced-motion`.
- Responsive desktop/mobile ; navigation TV et télécommande dans un lot ultérieur.

## Parcours membre
1. Accueil public : présentation, sélection éditoriale, découverte, recherche et appels à l'action.
2. Identification : e-mail/mot de passe, OAuth Discord, récupération de compte, vérification d'adresse, protection anti-bruteforce et sessions révocables.
3. Inscription : validation serveur, consentement, e-mail de vérification et création du compte.
4. Profils : un profil principal non supprimable et jusqu’à quatre sous-profils (cinq profils au total), nom, avatar, couleur, langue, préférences et indicateur enfant.
5. Sélection de profil : cartes animées, présence en ligne multi-appareils, dernière activité et verrouillage PIN facultatif.
6. Catalogue : films, séries, saisons, épisodes, recherche, filtres, fiches, favoris, historique et reprise de lecture.
7. Lecture : uniquement des fournisseurs et médias dont les droits de diffusion sont vérifiés et enregistrés.
8. Fonctions communautaires : Watch Parties, invitations, chat modéré, signalements et présence.

## Administration
- Vue générale : indicateurs d'activité, état des services, événements récents.
- Catalogue : import CSV/JSON, recherche TMDB pour métadonnées, édition, publication, archivage et gestion des médias.
- Droits de diffusion : registre des licences, territoires, fenêtres, dates d'expiration, justificatifs et statut de validation.
- Membres : recherche, suspension, sessions, signalements, historique de sécurité.
- VIP : offres, périodes, avantages, renouvellements, remboursements et historique. Les droits sont déterminés par les événements de paiement vérifiés côté serveur.
- Publicités : campagnes, créas, emplacements, ciblage conforme, fréquence, calendrier, consentement et statistiques.
- APIs : configuration des intégrations, statut, quotas, erreurs, rotation de secrets. Les secrets ne sont jamais renvoyés au navigateur.
- Monitoring : disponibilité, health checks, latence p50/p95/p99, taux d'erreurs, CPU, mémoire, DB, files et alertes.
- Administration : rôles globaux et locaux, permissions granulaires, paramètres, maintenance, journaux d'audit et sauvegardes.

## Règles de sécurité et de données
- Le RBAC est appliqué par l'API, refus par défaut, avec séparation stricte des rôles globaux et locaux.
- Authentification par cookies de session HttpOnly, Secure, SameSite adapté, rotation et révocation ; pas de secret dans le stockage navigateur.
- Limites de débit atomiques et partagées entre instances.
- Toutes les opérations administratives sont journalisées.
- Import et paiements idempotents ; webhooks signés.
- Les clés TMDB/Discord/Stripe et autres secrets restent exclusivement côté serveur.
- OAuth Discord vérifie le paramètre state et refuse l’auto-liaison d’une adresse déjà utilisée ; l’association de comptes doit être effectuée depuis une session authentifiée.
- Les webhooks Stripe sont vérifiés sur le corps HTTP brut, avec fenêtre anti-rejeu et déduplication des identifiants d’événements.
- Aucune URL de streaming n'est approuvée par simple correspondance TMDB ou disponibilité technique.
- Les données de production sont interdites dans le dépôt Git et les fixtures de tests.

## État de l'implémentation (18 novembre 2026)
- [x] Dépôt V2 initialisé et audit V1 documenté.
- [x] Socle frontend React/Vite/TypeScript ajouté.
- [x] Première interface animée : accueil, écrans d'authentification, sélection et édition de profils, catalogue d'aperçu, navigation d'administration.
- [x] API Fastify initiale, persistance PostgreSQL, inscription/connexion e-mail et sessions sécurisées.
- [x] Gestion serveur d’un profil principal protégé et de quatre sous-profils maximum (cinq profils au total), édition, suppression des sous-profils et heartbeat de présence.
- [x] Première protection RBAC de l’administration et endpoint de métriques réelles (comptes, profils, sessions, latence SQL).
- [x] Backend OAuth Discord : échange de code, contrôle du state, e-mail Discord vérifié, création de compte et session ; nécessite les identifiants Discord et un test de configuration réel.
- [ ] Liaison d’un Discord à un compte e-mail existant, vérification/récupération d’e-mail et modèles transactionnels complets.
- [ ] Présence multi-appareils consolidée, indicateurs « récemment actif » et PIN de profil.
- [x] Modèle PostgreSQL de catalogue films/séries, import API JSON par lots (100 max), journal d'audit et publication bloquée tant que les droits ne sont pas vérifiés.
- [ ] Interface d'import catalogue, édition, validation des licences et publication.
- [x] Fondations Stripe Checkout en abonnement, liste blanche des Price IDs, vérification de signature des webhooks, idempotence et synchronisation de l’état des abonnements.
- [ ] Interface de gestion des offres VIP, remboursements, avantages et portail client Stripe.
- [ ] Gestion des campagnes publicitaires et serveur de diffusion publicitaire.
- [x] Recherche de métadonnées TMDB côté serveur, statut d’intégrations dans l’administration et test d’envoi e-mail Resend.
- [x] Registre de configuration pour Discord, TMDB, Stripe, Resend, stockage S3/R2, Redis, Sentry et PostHog ; les fournisseurs non testés sont affichés « configurés » et non « connectés ».
- [ ] Adaptateurs réels S3/R2 et Redis, instrumentation Sentry/PostHog/OpenTelemetry, alertes et tests de bout en bout.
- [ ] Tests e2e, sécurité, CI complète et déploiement.

**Important :** l'interface actuelle est un prototype interactif de présentation. Les indicateurs et contenus visibles sont explicitement des états d'aperçu ; aucune création de compte, transaction, présence réelle ou mesure de latence n'est simulée comme si elle était en production.

## Questions produit à trancher avec le propriétaire
Les décisions suivantes conditionnent le modèle de données et les parcours :
1. Connexion : e-mail/mot de passe + Discord OAuth, ou ajouter Google/Apple ?
2. Profils : le profil principal compte-t-il dans la limite de cinq ? Faut-il un code PIN par profil et des restrictions enfants par âge ?
3. Présence : afficher « en ligne » uniquement pendant l'activité, ou aussi « récemment actif » avec durée configurable ?
4. VIP : abonnement mensuel/annuel, achat à vie, avantages gratuits, ou plusieurs niveaux ?
5. Publicités : visibles pour tous, uniquement les comptes gratuits, ou désactivables par option VIP ?
6. Catalogue : TMDB uniquement pour les métadonnées, import manuel aussi, et quels formats de fichier doivent être acceptés ?
7. Administration : un super-admin unique, ou plusieurs rôles globaux avec permissions configurables ?
8. Cibles prioritaires : web desktop/mobile d'abord, puis Android/Android TV/Fire TV, ou développement simultané ?

## Choix techniques proposés
- Monorepo TypeScript, frontend React/Vite.
- API Fastify, schémas partagés et validation stricte.
- PostgreSQL recommandé pour la production multi-instance, les sessions, la présence et les opérations concurrentes ; import V1 SQLite réalisé via une migration contrôlée et répétable.
- Redis pour présence temps réel, rate limiting partagé, pub/sub et tâches différées uniquement si le déploiement multi-instance le nécessite.
- Stockage objet compatible S3 pour affiches, avatars et médias autorisés.
- OpenTelemetry ou métriques Prometheus pour latence et observabilité.
