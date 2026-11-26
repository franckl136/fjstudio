# Folk & Joy Studio 0.4.0-rc.1 · rapport de recette Windows

26 novembre 2026. La candidate s’appuie sur le Studio local et sur les travaux de portefeuille qui se trouvaient dans le checkout produit. Le commit applicatif qualifié est `05678eb`. Le serveur, le worker et les comptes utilisés pour la recette sont jetables. Les sorties de la campagne sont rattachées au commit dans le PostgreSQL de recette.

## État initial et exécution du programme

| N° | Sujet | Statut | Résultat |
|---|---|---|---|
| 1 | État initial | Terminé et testé | Produit en version 0.3.0-rc.1 sur `30fa4c1`. Dix-sept fichiers suivis modifiés et vingt fichiers locaux recensés. Les 79 tests de départ ont réussi sur une base dédiée. |
| 2 | Architecture observée | Terminé et testé | Les ports historiques 3030 et 3040 correspondent à deux installations du même Core Node. Le Core sert les pages, l’API et les assets. Les workers réclament les tâches par HTTP et les preuves sont conservées dans PostgreSQL. Au premier relevé, ces deux serveurs et leurs bases étaient arrêtés. |
| 3 | Anomalies | Terminé avec réserves | Présence et occupation portaient des libellés ambigus. Les exemples du Studio apparaissaient dans les projets sans provenance claire. Une preview HTML a rendu un résultat non qualifié sur un passage intermédiaire. Sa cause historique est indéterminée. Les diagnostics actuels distinguent les refus observables du conteneur ou de son reçu. |
| 4 | Décisions techniques | Terminé et testé | Worktree et base de recette distincts. Les sources restent explicites, les captures versionnées et les contrôles d’accès du Core en vigueur. Les adaptateurs documentaires travaillent localement, à budget IA nul. |
| 5 | Roadmap | Terminé avec réserves | A a livré l’audit. B couvre les indicateurs et Academy. C couvre les métadonnées et l’ERD. D relie les missions, la mémoire et Quality. E livre le pilote café et trois pièces. F livre les vues transversales, les previews et cette qualification. Les extensions ouvertes figurent aux points 18, 25 et 26. |
| 6 | Modifications | Terminé et testé | Six migrations additives 021–026. Modules Academy, Explorer, chronologie, profils Quality, architecture et automatisations. Évolutions des routes, vues et recettes existantes du Studio. Atlas et contrôleur du Loft locaux. Le jalon initial séparé conserve les améliorations antérieures, dont la migration 020. |

[Audit original](audit-initial.md) · [Cartographie initiale des modules](cartographie-fonctionnelle.md) · [Architecture](cartographie-architecture.md) · [Risques](risques-et-anomalies.md) · [Roadmap](roadmap.md)

## État des modules

| N° | Sujet | Statut | Résultat et limite de portée |
|---|---|---|---|
| 7 | Command Center et navigation | Terminé et testé | Même tri français des projets sur sept espaces et sélecteurs. Accès direct aux décisions, aux missions, aux postes hors ligne et aux résultats. Des filtres par projet, période et type permettent de rejoindre l’origine d’une activité. La santé d’un projet repose sur les missions et le dernier contrôle disponibles. |
| 8 | Academy | Terminé et testé | Dix-neuf leçons en quatre parcours. Carnet personnel, reprise après rechargement, retour sur réponse incorrecte, données synthétiques isolées. Les exercices passent par les adaptateurs documentaires, le contrôle A1 ou l’importateur SQL. Les exercices sur GitHub, les sauvegardes et les previews enseignent à interpréter un cas fourni. |
| 9 | Database Explorer | Terminé avec réserves | Fiches de tables, colonnes, contraintes, index, vues, fonctions, triggers, migrations, permissions relevées, recherche et comparaisons. Les données de lignes, descriptions libres et corps de fonctions restent dans la source. La date de modification d’une table reste inconnue sans preuve. |
| 10 | Couverture des bases | Terminé avec réserves | PostgreSQL interne de recette capturé après 26 migrations. Son schéma public contient **50 tables, 2 vues, 49 clés étrangères et 96 index**. L’introspection d’un projet a été vérifiée avec un rôle de métadonnées sur une autre base synthétique locale. Aucune base métier externe n’a été connectée. |
| 11 | Sources réellement prises en charge | Terminé avec réserves | Catalogue PostgreSQL local, import SQL PostgreSQL, migration incrémentale et modèle Prisma/PostgreSQL. Chaque source possède un projet, un environnement et une provenance. La compatibilité Supabase couvre sa couche PostgreSQL locale. Les services Supabase et les connexions hébergées restent sans qualification terrain. |
| 12 | Relations et ERD | Terminé et testé | FK simples et composites avec colonnes ordonnées, actions référentielles et cardinalité documentée. Recherche, focus et voisinage, filtres, déplacement, zoom et export PNG ont été exercés dans Chrome. Les relations viennent des déclarations ou du catalogue. |
| 13 | Sécurité et RLS | Terminé avec réserves | Cloisonnement par projet, rôle catalogue minimal, lecture seule de la source, masquage, révocation et refus des rôles excessifs testés. Le schéma interne de recette déclare zéro policy RLS. Les droits applicatifs du Studio sont contrôlés par le Core. Les policies synthétiques de projet ont permis de tester la présentation et la qualification statique. Un test d’efficacité par rôle métier reste propre à chaque projet. |
| 14 | Agent Office | Terminé et testé | Plan pixel art isométrique, quatre salles, personnages dérivés des contacts et des baux, fiches et relecture. Le préparateur et le vérificateur peuvent être suivis jusqu’aux checkpoints puis retrouver le café après remise. Les PR Cursor identifient des sessions historiques. Les modes sans JavaScript, sans atlas et classique ont été vérifiés. |
| 15 | Orchestration | Terminé avec réserves | Huit finalités et champs adaptés, deux ordonnancements, plan modifiable avant validation, dépendances persistées, baux, délais, reprise et vérification déterministe des deux preuves avant la synthèse. L’exécution porte sur trois tâches documentaires. Un agent de développement connecté à un IDE ou un éditeur autonome de graphe demanderait une extension. |
| 16 | Project Intelligence | Terminé et testé | Recherche, historique, confiance, contradictions et validation humaine. Une révision peut référencer une observation Git précise, un résultat Lab ou un instantané de schéma. Les missions indiquent la version utilisée. Une source révoquée disparaît des liens consultables. |
| 17 | Quality Lab | Terminé avec réserves | Six profils configurables, onze familles de contrôles et des bilans associés à des preuves du projet. Les contrôles du schéma sont statiques. Les profils HTML, TypeScript autonome et la campagne complète Studio produisent des résultats d’exécution. Lint, build et performance restent indiqués comme non exécutés tant qu’un exécuteur approprié manque. |
| 18 | App Lab, Architecture et Automatisations | Partiellement réalisé | Preview HTML et capture 960 × 600 dans Chromium isolé. Inventaire figé au commit, profils, historique, comparaisons et règles périodiques ou sur changement de commit local. Le Centre d’automatisation retrouve la dernière exécution réelle de la règle. L’architecture décrit les objets observés. Les previews multi-services et la découverte d’une topologie API distribuée restent ouvertes. |

[Parcours d’un projet](parcours-projet.md) · [Academy](../studio-academy.md) · [Sources et révocation](database-explorer.md) · [Profils Quality](quality-profiles.md) · [Loft](agent-office.md) · [Architecture et automatisations](architecture-automations.md)

## Qualification et livraison

| N° | Sujet | Statut | Résultat |
|---|---|---|---|
| 19 | Tests | Terminé et testé | TypeScript réussi. **101 tests sur 101 réussis**, zéro échec, ignoré ou annulé. Chrome 158.0.8127.89 a vérifié les rôles admin, opérateur et lecteur à 1366 × 900 et 390 × 844. Deux baux et trois checkpoints sur la mission documentaire, A1 nominal réussi, fixture incorrecte rejetée, preview et Quality PASS. Le parcours schéma → qualité → fiche → journal a confirmé la propagation de la révocation. |
| 20 | Documentation | Terminé et testé | README et CHANGELOG actualisés, cinq documents d’audit, guides Academy, Explorer, qualité, Loft, architecture et procédures intermodules. Les procédures historiques sont conservées avec leur portée. |
| 21 | Commits | Terminé et testé | Socle et audit `91f1283`, `e50ad53`. Academy `e96a6a2`, `df3b6b6`. Explorer `0c66b42`, `acc1056`. Loft `8f529f3`. Control Room `9cb5d49`, `db78483`. Architecture et règles `157ae72`. Quality `58288d5`. Command Center `dcdd90e`. Mémoire `60c06b5`. App Lab `4c57558`, `5c9f3c0`. Intégration `5451f93`. Version applicative `05678eb`. |
| 22 | Branches | Terminé et testé | La branche de développement est `feat/studio-evolution` dans `D:\DEV\FjStudio-Evolution`. Le worktree historique produit conserve ses changements. Le programme utilise uniquement le dépôt Studio. |
| 23 | Push GitHub | Terminé et testé | Le SHA applicatif complet `05678eba203a2b981395f8fa9554b5c54564ee47` a été poussé puis relu sur la référence distante de développement. Vérification des fichiers et signatures de secrets avant envoi. Le rapport est livré par un commit documentaire ultérieur. |
| 24 | Version | Terminé et testé | Candidate locale 0.4.0-rc.1 dans le manifeste npm et le verrou. Les migrations historiques sont restées octet pour octet à leur version précédente. Budget supplémentaire engagé de 0 €. |
| 25 | Limitations | Partiellement réalisé | Les connexions métier réelles sont **Préparé mais non connecté** pour PostgreSQL local autorisé. La consultation de lignes réelles et les previews applicatives multi-services sont **Non commencé**. Les exemples de formation et les fixtures Lab sont identifiés. Le filtre de capture de revue Git du produit reste limité à sa branche autorisée historique. |
| 26 | Prochaine étape | Préparé mais non connecté | Décider de l’activation sur 3040. Vérifier l’archive de l’instance produit et sa restauration sur une copie, puis qualifier cette copie avec ses comptes et ses configurations avant la bascule. Ensuite, choisir un unique projet pilote et fournir un export de son schéma de développement pour constituer sa première référence. |

### Reproduire et interpréter les preuves

Campagne `npm run quality:studio` sur l’arbre applicatif propre, avec `COMPOSE_PROJECT_NAME=fjstudio-evolution` et `STUDIO_EXPLORER_TEST_ROLE=1`. Le reçu garde le SHA avant/après, les temps, versions, empreintes de sortie et compteurs de tests. Le test catalogue crée puis retire un rôle dans la seule grappe synthétique. Le test de reprise restaure un dump dans une base éphémère et vérifie les preuves, la neutralisation des anciennes sessions et la mise en quarantaine des travaux hérités.

La paire dump/manifeste de **la base de recette avant migration** a été vérifiée séparément, 137 657 octets, SHA-256 `d4931e877dd27f18f1b4f2c3d64df589200d17b47a9d950c465975d7f79c49c3`. La campagne a utilisé Node 24.22.3, npm 11.19.1 (celui de l’installation Node appelée par la campagne), Docker Compose 5.7.1 et PostgreSQL 17.12. La commande npm.cmd du terminal indiquait 11.11.1. Les diagnostics App Lab ont en outre été exercés sur 30 captures nominales, dont neuf paires en parallèle. Le refus d’une source vide et les reçus invalides produisent des motifs bornés.

Les serveurs HTTP des scénarios, les sessions de test et les workers temporaires ont été fermés. Seul le PostgreSQL synthétique de recette est laissé en écoute, sur `127.0.0.1:55453`. Les instances historiques 3030 et 3040 restent arrêtées au dernier relevé. L’activation de cette version sur l’installation produit et l’accès à une source de données réelle demandent des décisions distinctes.

[Branche de développement du Studio](https://github.com/franckl136/fjstudio/tree/feat/studio-evolution)

## Preuves conservées

Le reçu applicatif de Quality Lab porte l’identifiant `f56e72a4-8e31-49b1-94d1-f8210e08511e`. L’empreinte SHA-256 du rapport stocké est `b3b5b9bb48d7ca2e840fc6db79852aa8722856ca62fb510a56ee070fed3ab386`. Les preuves portables ci-dessous contiennent uniquement les résultats et les scènes synthétiques de cette recette.

[Campagne sur commit propre](recette/campagne-studio.json) · [Parcours dans Chrome](recette/parcours-chrome.json) · [Plan du Loft](recette/loft.png) · [Exemple de diagramme relationnel](recette/relations.png)

### Consultation future de lignes

L’introspection actuelle fonctionne avec un compte limité aux catalogues. Pour évaluer un accès à des lignes métier, le responsable du projet devra désigner une vue et les colonnes communicables, leur masquage, le rôle lecteur et l’environnement. Le modèle envisagé utilise une projection fixe par source, une pagination par clé stable, un plafond de lignes et de durée, une trace des accès et une révocation vérifiée sur les pages suivantes. La recette initiale devra porter sur un jeu synthétique et une tentative croisée entre deux projets. La lecture de lignes reste désactivée dans cette candidate.