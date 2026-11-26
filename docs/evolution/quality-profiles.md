# Utiliser les profils de qualification

Dans un projet, ouvrir **Quality Lab → Profils de qualification**. Les profils **Rapide**, **Complet**, **Sécurité**, **Base de données**, **Architecture** et **Avant livraison** disposent chacun d’une sélection initiale. Un opérateur ou un administrateur peut cocher les contrôles qu’il souhaite suivre pour ce projet, puis cliquer sur **Enregistrer la sélection**. Un lecteur peut consulter la sélection et les bilans.

## Établir un bilan

1. Dans Quality Lab, qualifier une source Git locale autorisée et attendre la fin du passage. Pour examiner la base de données, choisir une photographie versionnée dans Database Explorer. L’instance qui héberge les campagnes de qualification du Studio permet également de sélectionner une campagne enregistrée.
2. Dans le profil souhaité, choisir les preuves à rapprocher et cliquer sur **Consigner le bilan**. Deux preuves Git sélectionnées doivent désigner le même commit. Quand la référence d’une photographie est un SHA Git, le Studio vérifie également sa correspondance.
3. Ouvrir le bilan. Chaque contrôle dispose d’un état, de la méthode employée et d’une observation. Le lien **Lire la preuve** ouvre le rapport ou la photographie qui documente le contrôle. Les empreintes SHA-256 permettent de retrouver la version observée. Le compteur de couverture inclut les mesures, réserves et échecs.

Le bilan peut être consigné en l’absence de preuve. Il affiche alors la raison de non-exécution pour chaque contrôle concerné. Les deux exemples intégrés au Studio servent au fonctionnement du laboratoire et sont exclus des preuves d’un projet.

## Mesures disponibles

| Contrôle | Preuve actuellement exploitable |
|---|---|
| Tests | Compteurs et code de sortie de la campagne npm du Studio dans son périmètre historique. |
| Typecheck | Campagne du Studio ou compilation stricte du fichier TypeScript autorisé par le projet. La portée du résultat est précisée dans le bilan. |
| Lint | Aucun exécuteur approuvé. Le bilan affiche « Non exécuté ». |
| Sécurité | Observation des références actives ou externes dans le fichier HTML examiné, ou inventaire des fonctions SECURITY DEFINER dans une photographie SQL ou PostgreSQL. |
| Dépendances | Nombre de dépendances déclarées dans package.json au commit examiné. Une analyse d’avis de vulnérabilité demande un autre contrôle. |
| Base de données | Résultats de l’audit statique existant sur tables, contraintes, relations, index, policies et fonctions de la photographie. |
| RLS | État déclaré de la RLS, nombre de policies et incohérences statiques observées. L’effet sur un rôle et des lignes donnés demande un essai distinct. Prisma laisse cet état inconnu. |
| Architecture | Inventaire des répertoires reconnus au commit du passage. Les passages anciens peuvent manquer de cet inventaire. |
| Performance | Aucun banc de performance applicatif disponible. Les durées techniques des passages restent accessibles dans leurs rapports. |
| Documentation | Présence observée du dossier docs/ parmi les répertoires inventoriés. La qualité rédactionnelle reste à examiner. |
| Build | Aucun exécuteur de build de projet approuvé. |

## Historique et autorisations

Chaque bilan mémorise la sélection exacte de contrôles, la révision du profil, l’auteur, la date et les références explicites des preuves. Modifier le profil produit une nouvelle révision. Les bilans précédents conservent leur sélection d’origine. Deux éditions incompatibles de la même révision déclenchent une demande de rechargement. Répéter une soumission du même bilan réutilise son identifiant.

Les résultats de schéma sont recalculés depuis la photographie référencée, après vérification de son empreinte et de son autorisation. Révoquer la source dans Database Explorer retire aussi ses informations et ses liens des bilans. Une empreinte incohérente interrompt la lecture. Les passages et campagnes sont résolus dans le périmètre de l’utilisateur et du projet.

Les routes HTML et JSON se trouvent sous `/projects/{projet}/quality/profiles` et `/api/projects/{projet}/quality/profiles`. Le sélecteur utilise `?profile=quick|complete|security|database|architecture|release`. Le formulaire `save` conserve la sélection et `review` rapproche des preuves existantes. Ces opérations n’exécutent aucune commande de dépôt.

## Vérification locale

La migration `025-quality-profiles.sql` crée les tables de préférences et de bilans. Sur l’instance de recette, exécuter `npm run typecheck`, puis `node --env-file=.env.local --test test/quality-profiles.test.ts`. Le test crée une base PostgreSQL temporaire, un dépôt Git synthétique et un serveur HTTP en boucle locale. Il couvre aussi le passage par le worker, les révisions concurrentes, les preuves d’un autre projet et la révocation.
