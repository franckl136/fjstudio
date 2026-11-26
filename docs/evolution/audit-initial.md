# Audit initial · 26 novembre 2026

## Dépôt et version
Le produit local provient de `D:\DEV\FjStudio-Product`, worktree de `D:\DEV\FjStudio`, version npm 0.3.0-rc.1. Le HEAD 30fa4c10ccab0c0fa03cc64400f1b545874e120d de feat/studio-product-foundation correspond à la tête vérifiée sur [GitHub](https://github.com/franckl136/fjstudio/tree/feat/studio-product-foundation). Aucun commit d’avance ou de retard lors du relevé. Les 17 fichiers suivis modifiés et 20 fichiers sans suivi englobaient le portefeuille, la connexion, les équipes, le loft et les sessions Cursor. Leur copie dans le nouveau worktree forme le jalon 91f1283. L’index et les fichiers de travail du produit restent à leur emplacement.

Les autres worktrees identifiés sont FjStudio (33f5738, G5), FjStudio-G51 (faa9a87), FjStudio-G52 (ebab6d7) et un checkout temporaire de recette à d663dcf. Les dossiers de livraison sont distincts des worktrees annoncés par Git. Branches locales relevées : feat/a1-local, feat/g3-mvp-local, feat/g3.1-g4-foundation, feat/g5-pilote-local, feat/g5.1-courses-qualification, feat/g5.2-studio-qualification, feat/studio-product-foundation et local/studio-product-integration-20261126. Le distant comprend également main et les branches docs/consolidation-pre-developpement et docs/revue-approfondie. Les derniers commits de fondation couvrent l’activation locale, le focus des formulaires, les campagnes et la sauvegarde chiffrée.

## Exécution constatée
Au premier relevé Windows, aucun listener sur 3030, 3040, 55432 ou 55440. La lecture de PostgreSQL sur 55440 retournait ECONNREFUSED. Après démarrage du moteur Docker installé, les conteneurs existants fjstudio-db-1 (55432) et fjstudio-product-db-1 (55440) étaient arrêtés. Les chiffres d’une session antérieure ne sont donc pas des mesures de présence pour cet audit. Les configurations et le code identifient bien deux instances historiques du même serveur Node, avec deux publications PostgreSQL distinctes. Les assets et vues sur 3040 sont servis directement par le Core du produit.

## Recette
Windows, Node 24.22.3, npm 11.11.1 et Docker Compose 5.7.1 disponibles. Réinstallation des 19 dépendances via le cache npm. La qualification précédente comptait 79 tests. La nouvelle branche utilise une configuration générée, un volume Docker neuf, le port PostgreSQL 55453 et des bases de test temporaires. Le rapport final donne les résultats de la campagne actuelle.

## Parcours et ergonomie
Le tri partagé du menu et les contrôles clavier sont à conserver, de même que les liens profonds vers les preuves. Au départ, deux pages comptent deux choses différentes sous des libellés trop proches : contacts récents et postes occupés. Les états vides de Lab proposent une fixture du Studio comme source pour un autre projet. Le loft peint est lisible en grand mais ses déambulations au café suggèrent de l’activité sans bail. Les guides Markdown ne permettent ni apprentissage pratique isolé ni reprise individuelle.
