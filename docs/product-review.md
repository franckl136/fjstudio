# Revue des changements Git du Studio

Dans le projet A, ouvrez **Revue des changements Git**, puis **Capturer les changements**. La capture compare les arbres du dernier commit de `feat/studio-product-foundation` et de son premier parent. Elle enregistre le nom de la branche, les deux identifiants Git, les changements visibles, une empreinte SHA-256 du reçu, l’identité humaine et la date. Les modifications locales en cours de rédaction restent dans le répertoire de travail.

Ouvrez les extraits que vous voulez examiner puis choisissez **Approuver** ou **Demander une révision**. La confirmation porte sur le reçu affiché. La décision est un avis local horodaté. Le Core relit la branche et le commit avant d’enregistrer un nouvel avis. Une branche avancée exige une nouvelle capture. Chaque compte conserve une décision par reçu. Répéter le même choix rend la décision existante. Les avis de deux personnes sont visibles séparément.

## Périmètre de lecture

La source est le dépôt du Studio contenant le serveur. Son origine enregistrée doit être exactement `https://github.com/franckl136/fjstudio.git`. La résolution vérifie le checkout et les liens de métadonnées d’un worktree. La liaison reste locale. La branche autorisée est définie dans le code. Les captures sont refusées sur `main`, les autres branches et les HEAD détachés.

Les fichiers ordinaires de documentation et de code de répertoires autorisés peuvent donner un extrait. Les chemins inhabituels, liens symboliques, binaires et fichiers de configuration donnent leurs métadonnées. Les noms typiques de secrets, clés, certificats, sauvegardes et authentification signalent un fichier sensible. Les blobs de ces chemins ne sont jamais ouverts par la revue. Pour les textes autorisés, les marqueurs courants de secrets ou les caractères de contrôle entraînent le retrait de l’extrait complet. Cette détection par motifs a une couverture limitée. La revue expose les extraits au périmètre du projet A et les conserve dans sa base et ses sauvegardes.

Chaque capture accepte jusqu’à 120 chemins. Le Core examine au plus huit candidats textuels de 16 Kio par version. L’extrait conservé est borné à 48 lignes et 2 400 caractères par fichier. Les renommages apparaissent comme suppression et ajout. Les nouvelles captures identiques retrouvent le reçu existant. La liste présente les 25 dernières captures.

## Droits et routes

Les comptes humains administrateur et opérateur autorisés sur A peuvent capturer et se prononcer. Un lecteur de A peut consulter un reçu et ses décisions. Le contrôle de projet s’applique à chaque requête. Les arguments Git, chemins et révisions proviennent du service.

| Route HTML ou même route préfixée par `/api` | Opération |
| --- | --- |
| `GET /projects/a/review` | Lire les dernières revues |
| `POST /projects/a/review` | Capturer le commit courant avec un corps vide (`{}` en JSON) |
| `GET /projects/a/review/<id>` | Lire la revue et ses avis |
| `POST /projects/a/review/<id>/decision` | Enregistrer `decision=approved` ou `changes_requested` avec `confirm=yes` |

La migration 013 crée les tables de revue et de décisions. Les tests dédiés vérifient la branche, les filtres de fichiers, le digest, la péremption des reçus, les droits et les avis concurrents de personnes distinctes. La recette écran de bout en bout ajoute un avis administrateur sur un commit réel puis le relit depuis un compte en lecture seule. [Recette navigateur et prérequis](product-workspace.md)
