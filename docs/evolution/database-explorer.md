# Database Explorer

## Lire le modèle du Studio

Ouvrez **Database Explorer**, puis **Base interne du Studio**. Une photographie regroupe les tables et vues, les colonnes et leurs types, les contraintes, les clés étrangères composites, les actions référentielles, les index, les fonctions, les triggers, les dépendances de vues, les privilèges et les policies PostgreSQL. Chaque fiche indique la provenance, l’environnement, le moteur et la date de capture. Les numéros de migrations appliquées proviennent du journal du Studio.

La maintenance collecte le catalogue `pg_catalog` dans une transaction PostgreSQL `REPEATABLE READ READ ONLY`. Elle enregistre ensuite les seules métadonnées dans une seconde transaction. Les routes HTTP de la base interne consultent cette photographie et nécessitent un compte administrateur. Le lecteur n’a besoin d’aucun identifiant d’administration sur la base inspectée. Le Core conserve son mécanisme de persistance existant.

La commande `npm run migrate` tente une capture après la migration. Pour actualiser le modèle indépendamment ou récupérer d’une capture indisponible, exécutez `node --env-file=.env.local scripts/explorer-capture.ts` depuis le Studio visé. Une capture explicite garde sa date propre, y compris si son empreinte est identique à celle de la précédente.

## Retrouver une relation

1. Ouvrez **Tables et vues**. Recherchez un objet par son nom ou choisissez un schéma et un type.
2. Ouvrez une table. Les colonnes d’une FK composite et de sa cible conservent leur ordre de déclaration. Une cible hors du périmètre autorisé est masquée.
3. Utilisez **Ouvrir le voisinage relationnel**. Le focus conserve la table et ses dépendances entrantes, sortantes ou les deux. Le filtre texte et la sélection manuelle réduisent encore le sous-ensemble.
4. Déplacez un bloc ou le fond avec la souris ou le doigt. Utilisez la molette ou les boutons de zoom. Un double-clic ouvre la fiche. **Recentrer** ajuste le cadrage. **Exporter la vue PNG** produit une image du cadrage courant.
5. La liste de relations reste disponible au clavier et sans Canvas. Les graphes représentent exclusivement les FK déclarées ou observées. `0..1` côté référençant requiert une clé unique compatible, sinon l’affichage indique `0..N`.

Le panneau **Sécurité et RLS** réunit les états RLS, les commandes, les rôles, les clauses USING et WITH CHECK, ainsi que les fonctions SECURITY DEFINER. Un administrateur peut revoir le contexte de chacune. Les littéraux de valeurs sont masqués. Les expressions dont le format n’est pas représenté portent le nom de leur catégorie syntaxique. La photographie conserve la présence des commentaires et les empreintes techniques des fonctions et triggers. Les corps des fonctions, descriptions libres, mots de passe et données de lignes restent dans la source.

## Retrouver les structures dans le code local

Ouvrez **Database Explorer → Structures du code local**. Pour chaque projet relié, le tableau indique le résultat du dernier relevé et propose un lien vers chaque structure disponible. Ouvrez une source puis **Diagramme relationnel** pour consulter les relations. Le même tableau existe dans l’espace de chaque projet.

Le Studio relit les dossiers reliés au démarrage puis toutes les cinq minutes. **Actualiser depuis le code** déclenche un relevé immédiat pour tous vos projets ou pour le projet affiché. Les lecteurs peuvent consulter les versions enregistrées.

Le relevé recherche les fichiers `schema.prisma`, `prisma/schema.prisma`, `schema.sql`, `db/schema.sql`, `supabase/schema.sql` et les répertoires conventionnels de migrations PostgreSQL, Supabase et Prisma. Il visite également les modules de premier niveau dans `apps` et `packages`. Il analyse les définitions du disque, y compris celles en cours de rédaction. Une empreinte SHA-256 identifie l’ensemble des fichiers et leurs chemins. L’historique permet de comparer deux versions. Une source révoquée reste révoquée.

Les éventuelles limites de représentation figurent dans chaque photographie. Un dépôt qui utilise un service hébergé sans déclarer de structure SQL ou Prisma reste visible dans le tableau.

## Importer une source de projet

Ouvrez la fiche d’un projet puis son Database Explorer, ou choisissez le projet sur la page d’accueil du module. Dépliez **Importer un schéma de projet**. Donnez un nom de source et un environnement. La référence facultative accepte un commit ou un nom de fichier SQL/Prisma. Les utilisateurs disposant d’un accès en écriture au projet peuvent importer. Un lecteur peut consulter les instantanés de ses projets.

| Adaptateur | Matériel conservé |
| --- | --- |
| SQL PostgreSQL | Déclarations de tables/vues, colonnes et contraintes explicites, FK, index explicites, policies, fonctions et triggers reconnus dans le document |
| Migration SQL | Évolution du dernier instantané SQL de la même source et du même environnement. Le rejeu d’une migration identique retrouve la photographie existante. Une référence de migration réutilisée avec un autre contenu est refusée. |
| Prisma PostgreSQL | Modèles et mappages physiques, colonnes, clés et index déclarés, relations vers des champs explicitement référencés. Les relations en mode émulé ne produisent aucune FK physique. |
| Introspection PostgreSQL | Catalogue réel des schémas explicitement autorisés, avec privilèges et états RLS. Compatible avec la partie PostgreSQL d’une instance Supabase locale respectant les mêmes conditions. Les services Storage, Auth et Edge de Supabase sont hors de ce connecteur. |

Les analyseurs WASM travaillent hors ligne. Le parseur PostgreSQL est `libpg-query` 18.2.7 (MIT), le moteur de schéma Prisma est `@prisma/prisma-schema-wasm` 7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7 (Apache-2.0). Leurs versions et intégrités sont épinglées dans le fichier de verrouillage npm. Un import ne lance aucune instruction SQL, fonction, générateur Prisma ou connexion déclarée dans le document. La source originale n’est pas conservée.

La projection SQL est partielle. Les instructions non modélisées sont signalées. Les projections et dépendances d’une vue, les index implicites, les valeurs calculées et la sémantique complète des expressions demandent une introspection réelle. Pour Prisma, le parseur accepte le format PostgreSQL avec datasource et URL déclarée dans le fichier ou fournie séparément par prisma.config ; les fonctions, triggers, policies et le RLS restent inconnus. Une migration Git est importée explicitement avec sa référence ; le Studio n’extrait pas automatiquement les migrations d’un projet externe.

## Configurer une introspection locale de projet

L’administrateur de l’instance peut déclarer une liste explicite de sources dans sa configuration protégée existante. La page web ne reçoit aucun mot de passe. Exemple de **métadonnées synthétiques**, avec une variable d’identification à fournir séparément selon la procédure locale du Studio.

```json
[{"project":"atelier","environment":"test","label":"Atelier QA","schemas":["public"],"secret":"STUDIO_EXPLORER_DSN_ATELIER_TEST"}]
```

Placez la liste dans `STUDIO_EXPLORER_CONNECTIONS`. La variable citée contient une URL `postgresql://<utilisateur>:<secret>@127.0.0.1:<port>/<base>`. Réservez un rôle différent à chaque source, doté de CONNECT et de USAGE sur les schémas retenus. Le contrôle refuse les rôles privilégiés, les membres d’autres rôles, les propriétaires et ceux dotés de droits d’écriture ou de lecture de lignes dans les schémas applicatifs. Ne modifiez pas les ACL d’une base existante pour activer l’outil sans l’accord de son responsable.

L’action **Introspecter** sur le projet est réservée à un administrateur autorisé. La configuration seule ne déclenche aucune connexion. L’instance accepte les environnements local, développement et test sur IPv4 loopback. Les relevés distants, de staging et de production passent ici par import de métadonnées. Aucune URL libre ni console SQL n’est proposée. Une photographie de projet n’implique aucune permission de modifier le dépôt ou la source inspectée.

Pour révoquer, ouvrez **Accès à cette source**, confirmez et utilisez **Révoquer la source**. La lecture des anciennes URL et les nouvelles captures sous cette identité sont alors bloquées. Retirez également la déclaration locale pour faire disparaître le bouton de configuration. La révocation conserve les versions en base pour la traçabilité et les sauvegardes. Une source encore autorisée peut être configurée sous une nouvelle identité par le responsable.

## Historique et limites

**Historique** liste les 100 versions les plus récentes et propose une comparaison au sein de la même source. Une URL explicite de version consultable reste stable. Le diff signale les ajouts, retraits et modifications des tables, colonnes, contraintes, index, paramètres RLS, fonctions et triggers à partir des métadonnées capturées. Pour un objet modifié, la vue affiche l’ancienne et la nouvelle représentation (350 caractères chacune). L’heure d’une altération DDL passée et sa migration d’origine par table ne sont pas reconstituées depuis des noms ou des suppositions.

La page manifeste les limites des imports et ne lit aucune ligne applicative. Un futur navigateur de lignes nécessitera un mandat distinct, une projection par table, une politique de masquage et des permissions explicites. Les captures se limitent à 16 schémas, 250 tables/vues, 1 000 routines et 10 000 éléments de colonnes/contraintes/index/policies/triggers. L’import web hérite de la limite du corps HTTP du Core (32 Kio avec encodage). Les captures directes utilisent un délai de connexion de 1,8 s, une limite de 3 s par requête et une seule connexion. L’API d’une source suit la même autorisation et la même séparation projet/environnement que l’interface.

## Recette synthétique

`test/explorer.test.ts` contrôle le parseur passif, le modèle Prisma, la lecture des catalogues réels, les FK composites, le masquage, les autorisations HTTP, les versions, les imports concurrents, les refus de droits excessifs et la révocation. Le cas créant un rôle temporaire de catalogue exige `STUDIO_EXPLORER_TEST_ROLE=1`, `COMPOSE_PROJECT_NAME=fjstudio-evolution` et le port de recette 55453.

`node --env-file=.env.local scripts/explorer-browser.mjs` crée sa propre base temporaire, teste l’import par formulaire, la fiche, la vue RLS, le zoom, la recherche, le déplacement du canevas et l’export PNG dans Chrome, puis contrôle le rendu aux formats 1366 × 900 et 390 × 844. Les captures restent dans le dossier temporaire annoncé par la recette.
