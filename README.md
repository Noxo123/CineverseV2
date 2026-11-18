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
