# Audit de départ · Studio, 26 novembre 2026

Le checkout en service est le répertoire historique FjStudio, branche `feat/g5-pilote-local`, commit `33f5738`. Le Core répond en HTTP sur 127.0.0.1:3030, le worker Node et le conteneur PostgreSQL sont présents. Le test SQL en lecture a compté six missions et huit migrations (001 à 008). Les ACL du fichier de configuration limitent l’accès au compte Windows, à SYSTEM et aux administrateurs. Les archives et la base du poste restent en place.

Le dépôt Studio dispose d’un seul répertoire Git commun et de copies de travail distinctes G5, G5.1 (`faa9a87`) et G5.2 locale (`ebab6d7`). Ces trois branches étaient propres à l’ouverture du programme. L’ancienne copie de recette détachée est également rattachée au même dépôt. Le dossier de livrables G5.1 est une archive. Le remote Studio est `https://github.com/franckl136/fjstudio.git`. La base publique intégrable G5.2 est `d663dcf`, avec son moteur de vérification de pièces. La campagne précédente comptait 60 tests sur le Studio local complet et 18 sur la branche portable.

| Composant audité | Capacité existante | Limite constatée au départ |
|---|---|---|
| Noyau G3/G4 | Missions, droits par projet, baux, générations, historique, pause et reprise | Deux projets et deux rôles déterministes dédiés à un parcours de fixture |
| Project Intelligence | Recherche, validation, révisions, provenance et contexte figé | Import d’un document fixe par projet, contexte orienté fixture |
| Quality Lab | Verdicts, comparaison de passages, contrôle SHA-256 | Campagnes spécialisées, pas de programmation générique depuis le produit |
| Contrôle des agents | Exécution réelle des deux rôles locaux avec heartbeat | Le graphe G5 incorporait des références propres à un pilote particulier |
| App Lab | Registre de sessions G4 et archives spécialisées G5 | Le profil G4 décrivait une simulation ; il faut un profil générique exécuté dans un navigateur isolé |
| Agent Office | Vue texte d’activité par identité | Espace de travail visuel à construire |
| Exploitation | Sauvegarde, restauration vers un nouveau nom, manifestes et contrôles Windows | Qualifier une restauration de la nouvelle version et la quarantaine des travaux restaurés |

## Décision de reprise

La branche `feat/studio-product-foundation` part de la branche publique du Studio. Le noyau générique, les contrats, le stockage et les outils Windows sont repris depuis G4.3 (`e952262`). Les huit migrations historiques conservent leurs octets Git. Les archives G5 restent consultables dans leur environnement préservé. La nouvelle branche utilise exclusivement des documents et applications de recette du Studio.

La recette du produit utilise sa propre configuration locale, sa base et ses identités. Une version visible en recette n’active aucune mise à jour de l’installation historique. Les prestations distantes, le routage vers un fournisseur et les publications officielles restent soumis aux accords prévus.
