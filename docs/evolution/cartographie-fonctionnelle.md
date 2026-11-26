# Cartographie fonctionnelle initiale

| Module | Parcours, persistance et permissions | Preuve disponible | État initial |
|---|---|---|---|
| Command Center | SSR et API par projet. Compteurs, Git, alertes, missions et journal lus en transaction. | product-workspace.test.ts et scénario Chrome avec trois profils | Opérationnel, journal court et peu filtrable |
| Agent Control Room | Contrat modifiable à l’état brouillon, validation, dépendances, baux, checkpoints et verdict en PostgreSQL. Autorisation projet et rôle. | Tests control-room et binôme de projet | Opérationnel pour les trois tâches documentaires |
| Agent Office | Relevé local et liste accessibles. Stations par rôle et clic vers les preuves. Sessions Cursor archivées avec provenance GitHub. | Tests d’isolation et de replay desktop/mobile | Opérationnel, direction artistique à revoir |
| Project Intelligence | Révisions, proposition/validation, obsolescence, contradictions, recherche et contexte figé par projet. | Tests d’accès croisés et de contexte | Opérationnel, liens vers autres objets à compléter |
| Quality Lab | Structure HTML, TypeScript borné, Chromium, comparaisons et campagnes du Studio. | Rapports et preuves versionnés, tests de restauration | Opérationnel pour ces profils |
| App Lab | Preview d’un HTML autorisé au commit, capture, comparaison, historique ; conteneur borné. | Recette navigateur + tests Lab | Partiel pour les applications multi-services |
| Dépôts et opérations | Observation locale explicite, vérification et copie chiffrée d’archives, reprise. | Tests Git, sauvegarde, restauration et quarantaine | Opérationnel selon configuration locale |
| Comptes | Rôles admin/opérateur/lecteur, session et restrictions par projet, option locale validée pour le premier admin. | Tests connexion, révocation, origine et périmètre | Opérationnel |
| Academy | Guides existants en Markdown | Aucune progression ni scénario pédagogique partagé dans le code initial | Absent |
| Database Explorer | Vingt migrations Studio et rapports de qualification disponibles | Aucune navigation des catalogues, aucun adaptateur de source projet initial | Absent |

Les preuves de cette table sont des tests identifiés et des parcours examinés. Les résultats réellement rejoués pour la livraison figurent dans le rapport final.
