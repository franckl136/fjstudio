# Livraison et périmètre qualifié · 0.3.0-rc.1

Cette candidate est destinée au poste Windows de recette. Le Studio historique et le produit candidat ont des bases et des ports distincts. Le projet mobile n’a servi ni de checkout ni de cible de test. Les jeux de données sont synthétiques. Le budget additionnel pour les fournisseurs et les services est de 0 €.

## État initial et choix d’architecture

Le checkout historique `D:\DEV\FjStudio`, sur `feat/g5-pilote-local` à `33f5738`, servait six missions avec huit migrations. Le produit reprend la base publique G5.2 `d663dcf` et les composants génériques éprouvés du Studio, dans `D:\DEV\FjStudio-Product` sur `feat/studio-product-foundation`. Les jeux privés d’un ancien pilote restent dans leur installation d’origine. Le détail des worktrees et des écarts figure dans l’[audit de départ](audit.md).

Le monolithe TypeScript rend les vues HTML côté serveur. Le Core utilise PostgreSQL pour les projets et rôles, les documents et révisions, les missions et tâches, les tentatives et checkpoints, les décisions, les rapports et les reçus d’exploitation. Les clés étrangères incluent les identifiants de projet pour les références intermodules. Les workers se connectent au Core depuis la boucle locale et ne transmettent à leurs processus de calcul que l’identité nécessaire. Docker fournit l’isolation des exécutions de code candidat autorisées. Le [guide d’exploitation](exploitation.md) détaille les processus, migrations, limites et journaux.

## Modules et preuves

| Module | Fonctionnel et testé | Limites de cette version |
| --- | --- | --- |
| Command Center | Projets, droits, profils révisés, alertes de validation, missions, tâches, reçus de sauvegarde | Mesures à l’échelle du poste de recette |
| Project Intelligence | Recherche française, sources Git autorisées, empreintes, conflits, sélection explicite de révisions validées, révocation prospective | Sélection lexicale bornée et extraits de documents |
| Agent Control Room | Plan de revue, trois adaptateurs locaux, dépendances, deux baux simultanés, quotas, pause, reprise, décisions et preuves | Plan de revue documentaire spécialisé. La planification libre de travaux logiciels par un modèle reste à construire |
| Quality Lab | Profils HTML, rendu et TypeScript autonome, règles temporelles et sur changement, comparaison de résultats, campagne du Studio liée à un commit | Une campagne complète concerne le Studio de confiance. Les contrôles applicatifs dépendent des profils effectivement disponibles |
| App Lab | Lecture de blobs autorisés et inventaire des manifestes, Chromium sans réseau, capture liée au commit, nettoyage et résultat persisté | Page HTML statique et styles intégrés. Les builds et serveurs full-stack et les tests d’un projet arbitraire nécessitent un profil qualifié |
| Agent Office | Postes visibles selon leurs permissions, baux, heartbeats, détail des affectations, rafraîchissement suspendu à la fin | Les présences représentent des rôles de runners ; aucun état de réflexion ou de disponibilité fournisseur n’est inféré |
| Revue Git et échanges | Revue du dernier commit Studio, filtrage des fichiers sensibles, décision historisée et liée à la révision. Export local sur consentement, import idempotent d’une réponse comme proposition de connaissance à arbitrer. | Écriture Git automatisée depuis l’application, webhooks et raccordement des fournisseurs hors de la candidate |

L’adaptateur d’indexation compte les titres et les lignes. L’adaptateur de couverture trouve les expressions demandées dans le texte fourni. Le vérificateur recalcule les mesures et confronte les deux preuves. Ces trois calculs s’exécutent réellement. Le budget externe vaut zéro. Les exécutables Codex et Cursor disponibles sur le poste n’ont pas été lancés pour traiter une mission du produit. Aucun service ChatGPT n’est connecté. Le travail manuel avec un outil indépendant reste sous le contrôle de l’opérateur.

## Critères d’acceptation

| Critères du programme | Vérification et résultat |
| --- | --- |
| 1–3 · Démarrage, persistance, isolement | HTTP 3040 et PostgreSQL 55440 en boucle locale, données persistées, retour 404 pour un autre projet. Démarrage avec mauvaise clé MFA refusé. |
| 4–5 · Missions et reprise | Fixture nominale réussie et incorrecte rejetée, deux checkpoints par mission A1. La revue documentaire produit trois checkpoints. Concurrence, expiration, reprise et rejeu couverts sur PostgreSQL. |
| 6–8 · Command, qualité, connaissances | Chrome a vérifié l’approbation attendue, les rapports PASS et la révision validée dans la mission. Les tests avec source incorrecte produisent le verdict défavorable attendu. |
| 9–11 · Orchestration, environnement, Office | Deux attributions actives apparaissent aux postes, puis le suivi s’arrête. La capture 960 × 600 provient de Chromium en conteneur. |
| 12–13 · Permissions humaines et runners | Enrôlement et reconnexion administrateur/opérateur/lecteur, erreur 403 sur écriture par le lecteur ; remise croisée et faux checkpoint refusés. |
| 14–16 · Restauration, trace, diagnostic | Comparaison de toutes les tables, quarantaine et reçus. Les événements conservent le projet, l’acteur, la tentative et les empreintes. Erreurs internes reliées à un identifiant de requête et à un code SQLSTATE. |
| 17 · Ressources | Limites d’exécution et de concurrence vérifiées pour le graphe et le Lab. La conservation locale des archives nécessite de suivre l’espace libre. |
| 18–20 · Documentation, version, GitHub | Guides des modules, changelog, tests associés aux lots et synchronisations vérifiées sur la branche produit dédiée. |
| 21–22 · Coût et indépendance | Les agents locaux, le contrôle du Studio et les previews travaillent sans compte fournisseur. Aucun nouvel abonnement, VPS ni appel IA facturé. |
| 23–24 · Multi-projets et opérations sensibles | Création en transaction et autorisations vérifiées côté serveur ; activation locale des comptes testée sur l’instance isolée. Les décisions humaines et leurs révisions restent traçables. |

## Mesures sur ce PC

Avant l’ajout du coffre, `npm test` a passé **71 tests sur 71**, sans échec, annulation ni test ignoré, en 75,9 secondes. Les quatre tests Windows du coffre et le contrôle TypeScript ont ensuite réussi. Le résultat de la campagne complète sur le commit publié est conservé dans **Quality Lab → Campagnes de tests du Studio**. Les profils négatifs du Lab doivent produire FAIL ou NOT QUALIFIED pour que leurs tests de comportement réussissent. Un test historique a détecté la perte du code SQLSTATE dans le diagnostic du Core ; le journal conserve maintenant le code et l’identifiant de corrélation. Un nouveau test Windows vérifie qu’on peut protéger deux fois la même DACL sans privilège d’audit.

La recette navigateur a utilisé Chrome 158.0.8127.89, deux formats de fenêtre (1366 × 900 et 390 × 844) et trois comptes synthétiques dans une base éphémère. Le parcours complet avec MFA, approbation, révision documentaire, contrôle Git, deux missions A1, qualification et preview a pris 6,834 secondes. La capture Web candidate a été produite séparément par Chromium 145.0.7632.6. Le compilateur isolé TypeScript 5.9.3 a détecté l’erreur attendue TS2322, ligne 1, colonne 14.

Sur deux projets et quatre identités de runner, 50 lectures successives de la vue Command Center après échauffement ont donné une médiane de 9,1 ms et un 95e percentile de 9,8 ms. La mesure couvre le service et PostgreSQL sur le poste avec les données de recette. Elle exclut le rendu du navigateur. La montée en charge multi-utilisateur, le volume de plusieurs mois et la durée d’une panne physique demeurent non qualifiés.

Le [journal de reprise](../product-recovery.md) donne le SHA-256, la base restaurée et les comparaisons du premier dump. Les scénarios avec sessions actives et bail interrompu sont exercés séparément dans la suite. La base de recette destinée à l’utilisateur attend l’enrôlement de son premier administrateur.

Les [échanges de mission](../product-handoff.md) sont tracés dans PostgreSQL. Le téléchargement exige une action humaine. Deux consentements distincts gouvernent l’inclusion du document original et des connaissances validées. Le retour d’un outil externe est soumis à la validation de l’opérateur et ne peut pas changer le verdict du Core.

## Exploitation et suite

Les lots versionnés sont consultables dans l’[historique de la branche de construction](https://github.com/franckl136/fjstudio/commits/feat/studio-product-foundation/). Le premier lot fixe l’[audit de reprise](https://github.com/franckl136/fjstudio/commit/414586c2186feeddd38fd6c0ceffa666fde2ace1). Les suivants réunissent le [noyau historique](https://github.com/franckl136/fjstudio/commit/3b846702217f672039ff6a2bc7ac2f9c64702db9), l’[orchestration](https://github.com/franckl136/fjstudio/commit/b75bb588b994ef9596d1930016d239e4cc807c4c), les [Labs](https://github.com/franckl136/fjstudio/commit/c4d2673e421c58cce407a564c4b16716d37a8b49), les [comptes et les sources](https://github.com/franckl136/fjstudio/commit/bcdb5ca12476192881c39c1afd42a416b138cb54), le [workspace](https://github.com/franckl136/fjstudio/commit/8e80456d04ed84b1a89e5a3436b7bdd32f626f9c), la [restauration](https://github.com/franckl136/fjstudio/commit/77cc5f7d0c867050fa8e0c522c30fcc540fb787e), le [correctif NTFS](https://github.com/franckl136/fjstudio/commit/b9b2100d9450498200220244244f5cb896f8cbb5) et les [parcours intégrés](https://github.com/franckl136/fjstudio/commit/72565e2a7ff3076b0c49a7c34615a7b820e9bbfa).

Le Core, les workers et la maintenance se lancent avec les commandes du [guide Windows](exploitation.md). L’inscription, l’expiration, les secrets et les ACL sont décrits dans le [guide des accès](acces.md). Les [profils de qualité](../product-lab.md) et la [campagne de tests](../product-campaign.md) décrivent ce que chaque verdict permet de conclure.

La première utilisation recommandée consiste à activer le compte administrateur, examiner la mission de recette, puis faire une mission documentaire sur un second projet synthétique avec un compte opérateur restreint. Une éventuelle intégration de modèle local, une preview d’application complète ou une activation sur l’instance historique demandent ensuite une décision de périmètre et une qualification dédiées. L’hébergement distant, les copies chiffrées hors site, le basculement entre fournisseurs et la vérification universelle des vulnérabilités et des politiques RLS restent ouverts.
