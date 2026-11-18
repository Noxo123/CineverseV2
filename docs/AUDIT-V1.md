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


## 9. Revue complémentaire — migrations, API, Discord et configuration

Cette section complète l'inspection initiale à partir d'une lecture ciblée des migrations 1–22, des modules de permissions, de plusieurs groupes de routes API, du bot Discord et d'un extrait de configuration d'environnement communiqué pendant l'audit. Les valeurs sensibles ne sont volontairement pas reproduites.

### 9.1 Migrations et intégrité des données

- Le schéma SQLite possède des contraintes utiles : clés étrangères, unicités, CHECK, clés composites et index de parcours.
- Les migrations sont numérotées jusqu'à 22 et beaucoup d'ajouts utilisent des gardes d'existence ou IF NOT EXISTS. Cela facilite certaines reprises, mais ne remplace pas un moteur de migration transactionnel et un test sur copie de base.
- **Migration 17 — opération destructive** : suppression de tables d'import/source historiques et remise à zéro des URL de lecture existantes. Elle est protégée par un enregistrement de version, mais son exécution sur une base non sauvegardée aurait un impact direct sur les données.
- **Migration 18 — approbation automatique** : les URL VidSrc correspondant à l'identifiant TMDB sont automatiquement marquées approuvées. Une correspondance d'URL et une disponibilité technique ne constituent pas une preuve de droits de diffusion. V2 interdira ce mécanisme : approbation humaine documentée, justificatif de droits, expiration et procédure de retrait.
- La progression V1 est liée à un identifiant de profil, mais la migration 19 ne suffit pas à démontrer un système complet de profils, de contrôle parental ou de permissions par profil.

### 9.2 Autorisations et API

- Le package de permissions V1 applique un refus par défaut pour les permissions administratives et distingue les permissions globales des permissions serveur.
- L'API résout les permissions administratives à partir du chemin et de la méthode HTTP. Cette approche centralisée est pratique, mais elle doit être testée route par route : une nouvelle route ou un chemin mal classé peut hériter d'une catégorie/action incorrecte.
- Les exceptions explicites de refus utilisateur sont prises en compte lors de l'expansion des permissions de gestion.
- L'authentification administrative vérifie les rôles Discord en direct pour les comptes Discord et échoue en mode fermé si cette vérification est indisponible. Le compte e-mail et le bootstrap super-admin nécessitent toutefois une revue dédiée des parcours et des règles de vérification.
- Les routes Watch Party contrôlent l'accès à la séance avant de retourner chat et présence. Le chat limite les messages à 10 par minute et par utilisateur/séance ; le comptage puis l'insertion ne sont pas atomiques, ce qui peut être contourné par des requêtes concurrentes. La limite doit être appliquée de façon atomique et partagée entre instances.
- Le nettoyage de présence dépend d'un horodatage conservé en mémoire dans le processus. En multi-instance, chaque instance exécute son propre nettoyage ; V2 devra confier cette tâche à un mécanisme partagé ou à un worker planifié.
- Fastify est configuré avec trustProxy: false. Ce choix est sûr par défaut, mais l'architecture de reverse proxy devra être explicitement documentée avant de s'appuyer sur les IP clientes pour la sécurité ou les quotas.

### 9.3 Bot Discord et services internes

- Le bot signe ses requêtes internes avec HMAC-SHA256 et un horodatage, et l'API vérifie une fenêtre temporelle d'une minute avec comparaison en temps constant. C'est une base correcte pour une identité de service.
- Le périmètre de cette identité doit rester strictement limité aux routes et méthodes attendues ; V2 devra ajouter une rotation de secret, une protection anti-rejeu explicite et des journaux sans données sensibles.
- Plusieurs commandes Discord s'appuient sur les permissions natives Discord. Ces permissions ne remplacent pas les autorisations métier de l'API : chaque action sensible devra être autorisée côté serveur.

### 9.4 Configuration d'environnement communiquée

L'extrait de configuration V1 fourni pour cet audit montre les points suivants, sans enregistrer ni reproduire les valeurs secrètes :

- Variables déclarées plusieurs fois : DISCORD_REDIRECT_URI et VITE_DISCORD_CLIENT_ID. Les doublons rendent le comportement dépendant de l'ordre de lecture et compliquent le diagnostic.
- Mélange d'origines HTTPS, HTTP et d'une adresse IP pour le site, le callback OAuth et le client. V2 utilisera une origine canonique HTTPS et un callback déclaré explicitement, identique dans le fournisseur OAuth et la configuration serveur.
- SESSION_SECRET est encore une valeur d'exemple dans l'extrait. Le démarrage de V2 devra refuser la production si un secret fort manque ou conserve une valeur de démonstration.
- Les variables VITE_* sont publiques par nature : seules des valeurs publiques (par exemple un identifiant OAuth client) peuvent y figurer. Aucun token, secret Stripe, secret Discord, clé d'administration ou clé API privée ne doit être préfixé VITE_.
- L'extrait contient des secrets de plusieurs fournisseurs. Même lorsqu'une valeur semble tronquée dans le message, il faut traiter les identifiants partagés comme potentiellement exposés et les faire tourner. Cet audit ne conclut pas que le fichier .env a été commité dans le dépôt : l'historique Git doit encore être vérifié séparément.
- Les noms de variables et leur consommation réelle doivent être alignés : V2 disposera d'un schéma d'environnement validé au démarrage, d'un fichier .env.example sans secrets, d'une politique de rotation et d'une documentation de déploiement.

### 9.5 CI et reproductibilité

Le workflow V1 installe avec npm install. Pour une CI reproductible, V2 utilisera un lockfile versionné et npm ci, puis typecheck, tests unitaires/intégration, build, audit des dépendances et contrôles de sécurité. Les tests d'autorisation devront couvrir les routes et les frontières entre serveurs/comptes.

### 9.6 Décisions renforcées pour V2

1. Aucun fournisseur de lecture V1 n'est repris ou approuvé par défaut.
2. Une source de lecture doit être autorisée juridiquement et contractuellement, pas seulement techniquement disponible.
3. Les secrets sont exclusivement côté serveur ou dans un gestionnaire de secrets ; aucune clé privée dans le bundle web.
4. Les variables d'environnement sont validées au démarrage avec échec fermé en production.
5. Les limites de débit, tâches planifiées et présences doivent être cohérentes en multi-instance.
6. Les migrations doivent être versionnées, testées sur copie, sauvegardées et réversibles par procédure documentée.

**Statut inchangé : phase 1 toujours ouverte.** Les parcours frontend, l'inventaire exhaustif des routes, la couverture de tests, l'historique Git/secrets et les procédures de sauvegarde/restauration restent à terminer.


### 9.7 Tests, sauvegardes et maturité opérationnelle

- L'arborescence V1 contient un fichier de tests Vitest principal (`tests/shared.test.ts`) et un script dédié de vérification de restauration SQLite.
- Les tests consultés couvrent surtout les schémas partagés, les URL média et le chargement du SDK Discord. Ils ne démontrent pas une couverture d'intégration des routes, des sessions, du RBAC, des paiements, des frontières multi-serveurs, des migrations ou des parcours de lecture.
- Le script de sauvegarde ouvre la sauvegarde en lecture seule, exécute `PRAGMA integrity_check`, crée une copie temporaire via l'API SQLite Backup et vérifie l'inventaire des tables. C'est un bon contrôle non destructif ; aucune exécution réussie sur une sauvegarde de production n'a été vérifiée pendant cet audit.
- La documentation V1 décrit une sauvegarde automatique avec rétention locale de 7 jours et recommande une copie hors VPS. La présence du code et de la documentation ne prouve pas qu'une copie externe ni qu'une restauration périodique sont effectivement configurées.

### 9.8 Écarts supplémentaires de configuration

- Le code API construit le callback Discord à partir de `WEB_ORIGIN` et du chemin `/api/v1/auth/discord/callback`. La variable `DISCORD_REDIRECT_URI` présente dans le fichier d'exemple et dans la configuration fournie n'est pas consommée par le code consulté. Il faut donc éviter de croire qu'une modification de cette variable change réellement le callback utilisé.
- La variable `SESSION_SECRET` apparaît dans le fichier d'exemple, mais aucune lecture de `process.env.SESSION_SECRET` n'a été trouvée dans la recherche ciblée. Les sessions observées sont des jetons opaques générés côté serveur et stockés sous forme de hash. Cette variable semble donc inutilisée dans le code examiné ; V2 ne conservera pas de variable morte et documentera précisément son mécanisme de session.
- La recherche ciblée n'a pas permis d'identifier un endpoint de webhook Stripe entrant. Le cycle de paiement et la confirmation d'abonnement doivent être audités plus profondément avant toute reprise de la monétisation ; V2 devra privilégier des webhooks signés, idempotents et vérifiés côté serveur.

### 9.9 Périmètre de l'audit restant

L'inspection complémentaire a renforcé les constats sur les migrations, le RBAC, le bot, les limites de débit, les tests et la configuration. Elle ne remplace toujours pas :
- la lecture exhaustive des 132 routes détectées, y compris chaque mutation et contrôle d'accès ;
- la vérification de tous les formulaires, pages et appels API frontend ;
- l'examen de l'historique Git complet et des fichiers supprimés pour détecter d'anciens secrets ou exports ;
- la vérification des paramètres réels de sauvegarde hors VPS et la répétition d'une restauration sur environnement isolé ;
- les tests d'intégration et de charge sur une copie isolée.
