# Fusion de la base Cineverse V1 → V2

## Ce qui a été fusionné

La migration PostgreSQL V2 `schema_migrations` version 6 ajoute le schéma des domaines de Cineverse V1 sous des noms `legacy_*` ou `discord_*`, afin d'éviter toute collision avec les tables d'authentification et de catalogue V2.

Domaines inclus :
- Identités Discord et liaison facultative avec un compte V2 (`legacy_discord_users`).
- Serveurs Discord, membres, réglages et permissions.
- Sondages, options et votes.
- Liens films historiques.
- Watch Parties, salons liés, présence et état de lecture.
- Entitlements VIP et mapping rôles Discord.
- Giveaways, participations et gagnants.
- Campagnes publicitaires, placements, ciblage serveur et événements.
- Jobs programmés.
- Commentaires, avis et signalements films.
- Chat et présence Watch Party.
- Présence bot et webhooks d'administration (URLs déjà chiffrées uniquement).

Les identifiants numériques historiques sont conservés dans les colonnes `legacy_*`; ils ne sont pas convertis implicitement en UUID des comptes V2.

## Compatibilité et précautions

- La migration 6 est exécutée dans une transaction et protégée par `schema_migrations`.
- Les tables sont isolées et ne remplacent pas `users`, `profiles`, `sessions`, `catalog_items`, `roles`, `user_roles`, `vip_subscriptions` ou les autres tables V2.
- Cette migration **ne copie pas les enregistrements de la base SQLite V1**. Il faut disposer d'un fichier SQLite V1 réel pour exécuter ensuite un import de données avec mapping et vérification.
- Ne lancez pas d'import sur la base de production sans sauvegarde et rapport préalable.

## Vérifier après mise à jour

```bash
npm install
npm run typecheck
npm test
npm start
```

PostgreSQL doit être disponible et `DATABASE_URL` configurée. La V2 applique automatiquement la migration au démarrage de l'API.
