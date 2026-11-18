# Audit initial — Cinéverse V1

Date de consultation : 18 novembre 2026  
Dépôt examiné : https://github.com/Noxo123/Cineverse  
Branche examinée : `main`  
Commit observé : `a360c2b3aa3363978e525c2192ddce0dc49c565f` — "Restore VidSrc compatibility by removing iframe sandbox"  
Dépôt cible V2 : https://github.com/Noxo123/CineverseV2

## 1. Périmètre et méthode

Inspection en lecture seule des métadonnées GitHub, de l'arborescence récursive, des fichiers d'entrée, manifests, composants principaux, modules API, schéma/migrations SQLite, permissions, documentation de sécurité et workflow CI.

L'arborescence retournée par GitHub contenait 109 entrées. Le fichier principal de l'API contient environ 306 Ko et le composant principal web environ 144 Ko. L'API comporte 132 déclarations de routes HTTP détectées par inspection statique.

Cet audit est une première revue du code et de la documentation. Il ne constitue pas un audit exhaustif ligne par ligne, un test d'intrusion, une validation en production ni une certification juridique.

## 2. Architecture constatée

| Domaine | Implémentation observée |
|---|---|
| Web | React 19, Vite, TypeScript |
| API | Fastify 5, TypeScript |
| Bot | discord.js 14, @discordjs/voice |
| Données | SQLite, better-sqlite3, migrations SQL/TypeScript |
| Contrats | packages/shared |
| Permissions | packages/permissions |
| Métadonnées | TMDB |
| Temps réel | états de séance, présence et chat Watch Party |
| Stockage média | intégrations historiques R2 décrites dans la documentation |
| Exécution | Node.js, PM2, Pterodactyl |
| CI | GitHub Actions |

Le dépôt est un monorepo npm avec workspaces apps/* et packages/*.

## 3. Fonctionnalités réellement repérées

### Authentification et comptes
- Inscription et connexion e-mail/mot de passe.
- OAuth Discord et sessions serveur transmises par cookie.
- Préférences de compte, profils et progression de lecture.
- Gestion administrative des utilisateurs et association Discord.

La présence de routes et de tables ne prouve pas à elle seule que chaque parcours est complet ou correctement testé.

### Catalogue et lecture
- Catalogue de films et import TMDB.
- Gestion administrative des sources.
- Contrôle technique de disponibilité de sources.
- Lecture et lancement de séances.
- Progression de visionnage multi-appareils (migration 19).
- Retours communautaires : commentaires, notes et signalements.

La documentation V1 décrit un fournisseur VidSrc unique après migration 17, qui supprime les anciennes sources. La compatibilité technique d'un embed VidSrc ne démontre aucun droit de diffusion. Ce fournisseur n'est donc pas repris comme fournisseur approuvé dans V2.

### Watch Parties et Discord
- Séances globales et ciblées par serveur.
- Activity Discord et OAuth d'Activity.
- Synchronisation d'état de lecture.
- Présence spectateur, chat de séance.
- Bot de gestion et commandes Discord.
- Configuration par serveur et annonces.

Ces fonctionnalités sont partielles au regard du cahier des charges V2 : hôte transférable, salons publics/privés, invitation complète, modération, reconnexion robuste et autorité temps réel doivent être audités et reconstruits/complétés.

### Administration et permissions
- Dashboard, gestion de catalogue, utilisateurs, rapports, webhooks.
- Rôles, permissions par catégorie, mappings Discord et exceptions utilisateur.
- Refus explicites documentés comme prioritaires.
- Journal d'audit.

Le modèle V1 constitue une référence utile, mais chaque endpoint et chaque contexte de ressource doivent être revérifiés avant réutilisation.

## 4. Constats techniques et risques

### P1 — Maintenabilité
Le fichier API principal est très volumineux et regroupe de nombreuses responsabilités. V2 devra séparer les domaines : identité, sessions, RBAC, catalogue, lecture, profils, Watch Parties, modération, Discord, administration et opérations.

Le composant web principal est également volumineux. V2 devra privilégier des routes/pages et composants métier indépendants.

### P1 — Échelle et disponibilité
Le guide sécurité V1 reconnaît que les limiteurs de débit en mémoire ne sont ni persistants après redémarrage ni partagés entre instances. Un mécanisme distribué ou un reverse proxy adapté sera nécessaire avant un déploiement horizontal.

### P1 — Droits de diffusion
Les sources V1 ne peuvent pas être héritées automatiquement. V2 exigera une preuve d'autorisation, une validation administrative traçable, une politique de retrait et un contrôle de disponibilité séparé du contrôle juridique.

### P1 — Modèle de compte
L'identité V1 est fortement centrée sur Discord. V2 doit posséder une identité Cinéverse indépendante, des comptes e-mail vérifiés, des sessions propres, plusieurs profils par compte et des liens OAuth optionnels.

### P1 — Fonctionnalités manquantes ou incomplètes à vérifier
- Catalogue de séries, saisons et épisodes.
- Recherche multicritère complète.
- Multi-profils et contrôle parental.
- Favoris et listes personnalisées.
- Historique de lecture complet.
- Notifications.
- Recommandations explicables.
- Chat communautaire global, blocage et modération.
- Administration VPS et sauvegardes/restauration.
- Application Android TV native ou client TV adapté.
- SEO public et accessibilité de bout en bout.

Ces éléments sont considérés comme non démontrés par l'audit initial, et non comme nécessairement absents de tout le code.

## 5. Qualité et CI observées

Le workflow CI V1 exécute :
- installation npm ;
- audit des dépendances, avec échec sur les vulnérabilités moderate/high/critical ;
- typecheck des workspaces ;
- build des workspaces ;
- tests Vitest.

La dernière exécution consultée le 17 novembre 2026 à 16:15 UTC était terminée avec succès : https://github.com/Noxo123/Cineverse/actions/runs/44123623801

Un succès CI est un signal utile, mais ne valide pas les scénarios métier non couverts, le déploiement VPS, les droits de diffusion ni l'absence de vulnérabilités inconnues.

## 6. Données et migration

V1 utilise SQLite et un historique de migrations jusqu'à la version 22, dont :
- RBAC et permissions administratives ;
- vérification des sources ;
- migration VidSrc-only ;
- progression de lecture multi-appareils ;
- fonctionnalités saisonnières et récompenses.

Aucune migration V1 vers V2 ne doit être lancée avant :
1. inventaire des tables et contraintes réelles ;
2. sauvegarde cohérente de la base de production ;
3. mesure de la qualité et des doublons ;
4. mapping des comptes, profils et identifiants ;
5. migration sur copie ;
6. tests de comptage et d'intégrité ;
7. répétition d'une restauration ;
8. plan de bascule et retour arrière.

Les données V1 ne seront jamais écrasées par une migration V2.

## 7. Décisions provisoires pour la suite

- V2 sera un projet autonome ; V1 restera intact.
- Le TypeScript et le découpage en packages du monorepo sont des acquis à conserver comme principes.
- Le découpage API par domaines est obligatoire.
- Les contrats API et schémas de validation seront partagés et versionnés.
- Le choix final du moteur de base de données et de l'architecture de déploiement sera documenté en phase 2 après l'inventaire des contraintes de migration et de charge.
- Les sources de lecture seront interchangeables, explicitement autorisées et jamais approuvées automatiquement.
- Les contrôles d'accès seront exécutés côté serveur avec refus par défaut et journalisation des actions sensibles.

## 8. Travaux restant à réaliser pour clore la phase 1

- Revue détaillée de chaque groupe de routes et des fonctions d'autorisation.
- Revue des migrations 1 à 22 et des contraintes/index.
- Revue des commandes et permissions Discord.
- Revue des parcours frontend et des appels API.
- Revue des tests existants et de leurs couvertures réelles.
- Vérification des workflows, artefacts, sauvegardes et procédures de restauration.
- Audit des dépendances et des secrets dans l'historique Git.
- Vérification des comportements déployés sur une copie isolée, sans toucher à la production.

**Statut : audit initial effectué, phase 1 non clôturée.**
