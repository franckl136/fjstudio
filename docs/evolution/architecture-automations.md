# Architecture Explorer et Centre d’automatisation

## Lire l’architecture d’un projet

Dans la fiche projet, ouvrez **Architecture Explorer**. Le tableau des sources montre l’entrée et la référence Git déclarées actuellement pour chaque source App Lab. Les deux exemples synthétiques du Studio portent leur propre mention. Un projet peut être enregistré sans posséder de source candidate App Lab.

Un clic sur le commit d’une source ouvre sa dernière capture. Le parcours relie l’entrée Git figée, les manifestes et dossiers détectés à la racine, le profil de qualification puis le passage et sa preuve. L’inventaire provient du commit lu par App Lab. Le worker et son runtime décrivent le traitement réalisé par le Studio. Les compteurs de dépendances proviennent du manifeste lu lors de cette capture, sans installation. Une capture ancienne qui ne mesurait pas les dossiers affiche une couverture inconnue. L’absence d’un nom dans la liste bornée ne démontre pas l’absence d’un service.

Un passage reste consultable après le retrait d’une déclaration locale. La fiche donne alors la version figée, sa date et l’empreinte SHA-256 du fichier. Lorsque le passage possède un rapport, Studio en recalcule l’empreinte avant l’affichage de la capture. Chaque source de schéma active du projet renvoie vers Database Explorer avec son environnement et sa provenance. L’existence de ce lien exprime une appartenance au même projet. Elle ne démontre pas qu’une application déployée utilise cette base.

Les APIs, les échanges entre services et la topologie de déploiement nécessitent des observations supplémentaires. Aucune dépendance entre deux modules logiciels n’est déduite de leur nom.

## Retrouver une règle et son résultat

Dans **Centre d’automatisation**, chaque carte correspond à une règle App Lab persistée pour une source et un profil. Le mode périodique peut mettre un travail en file à chaque échéance. Le mode sur changement compare le commit lu lors du contrôle au dernier commit traité. La prochaine échéance est celle du contrôle local.

La carte distingue le dernier message du planificateur, le dernier passage automatique lancé et le dernier résultat automatique terminé. Studio vérifie l’empreinte du rapport avant d’afficher ce résultat. Une nouvelle exécution peut être en file pendant que la carte garde le verdict de l’exécution précédente. Le statut « inchangé » signifie que le planificateur a consulté la source. Le lien de configuration ouvre la section des règles de Quality Lab. Son formulaire applique les droits habituels. La suspension conserve l’historique et enlève l’échéance affichée.

L’historique affiche jusqu’aux cinq derniers lancements automatiques et le nombre total enregistré pour cette source et ce profil. Les révisions successives d’une règle partagent cet historique. Les lancements manuels restent visibles dans le Lab.

## Contrat de lecture

| Route | Résultat |
| --- | --- |
| `GET /projects/<projet>/architecture` | Sources déclarées, dernière capture de chacune, détail de la capture sélectionnée et liens vers les schémas accessibles |
| `GET /projects/<projet>/architecture?run=<uuid>` | Capture historique choisie dans le périmètre du projet |
| `GET /projects/<projet>/automations` | Règles du projet, échéances et historique automatique |
| Préfixe `/api` sur ces routes | Métadonnées structurées dans le même périmètre |

La lecture utilise les métadonnées App Lab et les sources de schéma disponibles. Les octets des fichiers candidats, les captures binaires, les chemins de checkout et les chaînes de connexion sont exclus des réponses. Aucune de ces routes ne lance Git, un scanner, une qualification ou une connexion à une base de projet. Les mutations passent par les modules responsables.

Les tests de `test/project-operations.test.ts` utilisent une base PostgreSQL temporaire et un dépôt Git synthétique. Ils vérifient la différence entre déclaration et mesure, la prise en charge des anciens inventaires, le cloisonnement, la détection d’un rapport altéré, les contrôles périodiques, les verdicts automatiques, la suspension et les routes HTTP.
