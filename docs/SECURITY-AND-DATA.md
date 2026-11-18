# Sécurité des données — Cineverse V2

## Règle de dépôt

Le dépôt GitHub CineverseV2 est public. Il ne doit contenir aucune base de données runtime, sauvegarde, export utilisateur, secret ou fichier de configuration local.

Le fichier `data/cineverse.sqlite` a été détecté sur la branche `main` pendant l'audit du 18 novembre 2026. Il s'agit d'un blob SQLite de 12 431 010 octets. Son contenu n'a pas été ouvert ni importé dans V2 pendant cette revue ; sa nature (jeu de test ou données réelles) n'est donc pas établie.

**État : exposition potentielle à traiter.** Le fichier est actuellement suivi par Git. L'ajout d'un `.gitignore` ne le retire pas de l'historique et ne rend pas les données déjà publiées privées.

## Actions nécessaires pour le propriétaire

1. Déterminer si la base contient des données personnelles, des comptes, des sessions, des identifiants, des messages ou des données de production.
2. Si elle contient des données réelles ou sensibles, la retirer du dépôt et de tout l'historique Git public selon une procédure contrôlée, puis vérifier les forks, clones, caches et artefacts potentiellement accessibles.
3. En cas de secrets présents dans la base, les révoquer/faire tourner ; supprimer le fichier seul ne révoque aucun secret.
4. Pour une migration V1 vers V2, transférer la base par un canal privé et chiffré, depuis une sauvegarde cohérente, jamais via un dépôt public.
5. N'importer aucune donnée avant inventaire, validation du schéma, anonymisation si nécessaire et plan de migration/restauration.

## Règles permanentes

- Les bases SQLite, journaux, sauvegardes et exports restent hors Git.
- Les secrets sont fournis par l'environnement d'exécution ou un gestionnaire de secrets.
- Seul un `.env.example` avec des valeurs fictives et non sensibles peut être versionné.
- Les données de production ne sont jamais utilisées dans les tests automatisés.
