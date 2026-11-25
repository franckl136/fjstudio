# Sauvegarde et reprise du Studio produit

Les commandes ci-dessous s’exécutent sous PowerShell depuis le checkout du Studio candidat. Sur le poste de recette, son service PostgreSQL Compose écoute sur `127.0.0.1:55440`. La base source s’appelle `fjstudio_a1`.

## Sauvegarder et vérifier

```powershell
Set-Location D:\DEV\FjStudio-Product
$env:COMPOSE_PROJECT_NAME = 'fjstudio-product'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')
$dump = "backups\product-$stamp.dump"
npm.cmd run backup -- $dump
npm.cmd run backup:verify -- $dump
```

Chaque commande affiche son résultat et renvoie un code de sortie. Après un échec, consulter le diagnostic avant la commande suivante. Le fichier `.dump.json` doit accompagner le dump. Les deux noms sont créés exclusivement. Une paire incomplète ou un nom occupé reste en place pour inspection.

Le dump PostgreSQL au format personnalisé et l’inventaire de toutes les tables publiques proviennent du même snapshot transactionnel. Le manifeste contient la version effective du paquet Studio, la version PostgreSQL, les migrations et leurs empreintes, le nombre de lignes et une empreinte par table, ainsi que la taille et le SHA-256 du dump. La publication relit la paire sur disque. Le journal `studio_backup_checks` distingue le contrôle du fichier et la restauration isolée. Le SHA-256 permet de constater une divergence par rapport à un manifeste de confiance. Conserver dump et manifeste dans un emplacement dont les écritures sont maîtrisées.

Sur Windows, la publication utilise un dossier de travail NTFS privé. Dans le checkout produit, les autorisations du dossier `backups` sont limitées au compte Windows du Studio, à SYSTEM et aux administrateurs. Ces mêmes destinataires peuvent lire le fichier de sauvegarde et le manifeste. Pour un chemin local choisi ailleurs, les ACL du répertoire de destination relèvent de son propriétaire.

## Cadence et migration

| Commande | Résultat |
| --- | --- |
| `npm.cmd run maintenance` | Crée ou vérifie la paire du jour et la paire de la semaine sous `backups\fjstudio_a1\`. |
| `npm.cmd run maintenance:watch` | Effectue le contrôle au démarrage du processus, puis toutes les heures. |
| `npm.cmd run migrate` | Crée et vérifie une archive `before-migration-…` si un schéma Studio existant attend une migration. Une base vierge est initialisée directement. |

Les dates suivent UTC. La semaine commence le lundi. Le passage suivant crée les archives de la période courante lorsque le poste revient en ligne. Les créneaux pendant lesquels le poste était éteint figurent comme absences de sauvegarde. Un verrou PostgreSQL protège les passages concurrents. Une paire corrompue reste en place et une nouvelle paire reçoit un nom distinct. Les anciennes archives demeurent conservées, y compris au-delà du minimum de trente jours. L’espace libre et les interruptions du processus doivent être surveillés par l’exploitant.

Les lectures, l’archivage et la restauration se font sur ce poste. La copie chiffrée hors du poste et la conservation séparée des clés nécessitent un support et une procédure validés par son propriétaire. Un incident matériel touchant le disque local peut rendre les fichiers qui s’y trouvent indisponibles.

## Restaurer dans une base distincte

Utiliser le même `$dump` et la configuration locale qui a produit l’archive.

```powershell
$target = 'fjstudio_a1_restore_' + [Guid]::NewGuid().ToString('N')
npm.cmd run restore -- $dump $target
node --env-file=.env.local scripts/backup-history.ts backups
```

Le nom de cible doit être disponible. PostgreSQL crée une base depuis `template0`, y restaure les objets, puis compare les migrations et les empreintes de toutes les tables du manifeste avant d’appliquer les migrations du checkout. Une divergence conserve la base pour diagnostic. Un marqueur au niveau de la base empêche un ancien reçu présent dans le dump d’autoriser la mise en service. La transaction de fin lève le marqueur et inscrit un nouveau reçu après les vérifications et la quarantaine. L’inventaire d’un sous-dossier périodique se consulte avec `node --env-file=.env.local scripts/backup-history.ts backups/fjstudio_a1`.

| Élément restauré | État après la reprise |
| --- | --- |
| Comptes et projets | Rôles, rattachements, mots de passe dérivés et seconds facteurs enrôlés conservés. Toutes les sessions, invitations et inscriptions en cours sont révoquées. |
| Control Room | Missions en cours ou en attente d’approbation bloquées pour revue. Les baux actifs sont interrompus. Événements et checkpoints restent consultables. |
| App Lab et Quality Lab | Sessions historiques révoquées. Règles automatiques suspendues. Passages en file ou en cours clos avec le verdict `NOT QUALIFIED` et un rapport de reprise. |
| Travaux G5 historiques | Missions en file ou actives bloquées. Les tâches en attente ou en cours sont interrompues. Le journal porte un événement de restauration. |
| Parcours A1 historique | Anciens baux expirés, résultats déjà acquis conservés. Un nouveau runner du Studio peut reprendre le parcours synthétique lorsqu’un exploitant décide de mettre la base restaurée en service. |
| Fiches, documents et observations | Les données SQL, révisions et preuves de la source figurent dans la comparaison du snapshot. Les dépôts Git observés restent indépendants de l’archive PostgreSQL. |

Une remise en service avec les comptes humains enrôlés exige le même secret maître du second facteur. Les fichiers privés `.env.local` et `.env.human.local` sont gérés séparément du dump SQL. Garder une copie de récupération privée et chiffrée de la configuration lorsque le dispositif de conservation des clés aura été validé. L’exercice ci-dessous n’effectue aucun basculement de service.

## Journal de recette du 26 novembre 2026

Sur l’instance dédiée du poste Windows, les commandes `backup`, `backup:verify` et `restore` ont retourné 0. Le dump et le reçu isolé restent disponibles.

| Mesure | Valeur |
| --- | --- |
| Dump et manifeste | `backups/product-qualification-20261125232833747.dump` et son fichier `.json` |
| Version de l’application / taille | `folk-and-joy-studio@0.3.0-rc.1` / 132 975 octets |
| SHA-256 du dump | `36fff6023abdced69ac66f1c090de3470cd1b3b9c27d7a717583dfa59f15c36e` |
| Base isolée conservée | `fjstudio_a1_restore_product_20261125232833747` |
| Reçu de restauration | 25 novembre à 23 h 28 min 56 s UTC, soit le 26 novembre à 00 h 28 à Paris |
| Tables et migrations du snapshot | 39 tables comparées avec succès, 16 migrations d’origine. La cible a ensuite reçu la migration 017. |
| Comptages identiques source et cible | 2 projets, 2 missions A1 et 4 checkpoints, 1 mission Control Room, 3 checkpoints et 11 événements Control Room |
| Preuves Lab et connaissance | 3 passages PASS, 1 PNG de 22 040 octets, 1 fiche et ses 3 révisions, 1 observation de dépôt |

Le snapshot de recette avait zéro session humaine et zéro invitation ouverte. Le test PostgreSQL `test/product-recovery.test.ts` exerce séparément les comptes actifs, les invitations à deux stades, un bail en cours, une preuve déjà produite, les tâches G5 en cours et un Lab en file. Il vérifie l’invalidation des anciens accès, une nouvelle connexion avec le même second facteur, les rôles, les ACL effectives du dump et du manifeste et les données de la base source.

Les autres scénarios couvrent la concurrence de maintenance, le changement de semaine, les archives abîmées conservées, la sauvegarde préalable d’un schéma A1 et le refus d’une restauration divergente malgré un ancien reçu dans le dump. La comparaison intégrale parcourt les tables et sa durée dépend du volume. La mesure de cette recette porte sur ce jeu local.
