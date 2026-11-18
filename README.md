# CINÉVERSE V2

**Le cinéma en un seul univers.**

Cinéverse V2 est la reconstruction de la plateforme Cinéverse : découverte de films et séries, profils, lecture via des sources légalement autorisées, progression multi-appareils, Watch Parties, communauté, administration et applications Android / Android TV.

## Statut du projet

Le dépôt V2 est initialisé à partir d'un dépôt vierge. Le dépôt V1 est conservé comme référence d'audit et de migration ; il ne sera ni modifié ni utilisé comme environnement de déploiement V2.

- [Audit initial de V1](docs/AUDIT-V1.md)
- Cahier des charges : master prompt Cinéverse V2 fourni par le propriétaire du projet.

## Principes non négociables

1. Vérifier le comportement réel avant de déclarer une fonctionnalité opérationnelle.
2. Aucune source vidéo n'est autorisée sur la seule base de sa disponibilité technique.
3. Toutes les autorisations sont contrôlées côté serveur, avec refus par défaut.
4. Toute migration de données est précédée d'une sauvegarde vérifiée et dispose d'une stratégie de retour arrière.
5. Les secrets restent côté serveur.
6. Les tests, le lint, le contrôle TypeScript, l'audit des dépendances et le build conditionnent les livraisons.
7. Aucune modification de la production V1 sans validation explicite.

## Feuille de route

- [ ] Phase 1 — Audit technique et fonctionnel de V1
- [ ] Phase 2 — Architecture cible, modèle de données, contrats API et migration
- [ ] Phase 3 — Fondations, authentification, RBAC, base de données et CI
- [ ] Phase 4 — Design system, espace public et administration
- [ ] Phase 5 — Catalogue, recherche, profils, favoris et progression
- [ ] Phase 6 — Lecture autorisée, Watch Parties et communauté
- [ ] Phase 7 — Discord, Android, Android TV et Fire TV
- [ ] Phase 8 — Sécurité, validation, documentation et préparation de migration

Les cases ne seront cochées qu'après vérification des livrables correspondants.


## Développement local — premier socle

Prérequis : Node.js 22+, npm 10+ et PostgreSQL.

1. Copier `.env.example` vers `.env` et définir `DATABASE_URL`, `SESSION_SECRET` (32 caractères minimum), `WEB_ORIGIN` et `VITE_API_BASE_URL`.
2. Installer : `npm install`.
3. Démarrer l'API et le frontend ensemble : `npm start`.
4. Ouvrir `http://localhost:5173` (API sur `http://localhost:4000`).
5. Utiliser `Ctrl+C` pour arrêter les deux services.

L'API crée sa première migration PostgreSQL au démarrage, sous verrou consultatif. Le frontend utilise les endpoints de compte et de profils de l'API. Les autres rubriques d'administration restent des interfaces de travail tant que leurs services et permissions ne sont pas implémentés.

- Spécification fonctionnelle : [docs/PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md)
- Configuration des intégrations : [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- Audit V1 : [docs/AUDIT-V1.md](docs/AUDIT-V1.md)
- Sécurité et données : [docs/SECURITY-AND-DATA.md](docs/SECURITY-AND-DATA.md)
