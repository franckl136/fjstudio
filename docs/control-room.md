# Agent Control Room

## Faire travailler les agents locaux

Depuis un projet autorisé, ouvrir **Agent Control Room**, puis **Créer une mission**. Donner un objectif, un périmètre et le document à examiner. Saisir une expression attendue par ligne. Enregistrer le brouillon, examiner le plan, puis le valider. Pour une mission à risque « Approbation opérateur requise », une décision supplémentaire reste nécessaire. L’édition d’un plan en attente le ramène au brouillon. Le lecteur peut consulter et exporter les résultats.

Le profil `document-review-v1` s’applique à une revue documentaire reproductible. Pour essayer le parcours, soumettre un document composé de `# Installation` et, sur la ligne suivante, `Utiliser la boucle locale.`. Le critère `boucle locale` obtient une preuve sur la ligne 2. En ajoutant `sauvegarde quotidienne` aux expressions attendues, le verdict devient FAIL. Le texte est traité comme une donnée, y compris lorsqu’il contient des instructions.

| Adaptateur | Attribution et travail réalisé | Preuve remise |
|---|---|---|
| `studio-markdown-index-v1` | Préparateur. Lit le texte soumis, compte les lignes et les titres Markdown ATX. | Empreinte du document, nombre total de titres et position des 32 premiers. |
| `studio-criteria-lines-v1` | Vérificateur. Cherche chaque expression sur une ligne, avec casse et espaces normalisés. | Jusqu’à cinq numéros de ligne par expression, et couverture de chaque critère. |
| `studio-evidence-verifier-v1` | Vérificateur. Attend les deux checkpoints, refait les mesures puis compare leurs empreintes. | SHA-256 des deux résultats, références contextuelles, règle appliquée et verdict PASS ou FAIL. |

Les deux premières tâches sont indépendantes et leurs baux peuvent se chevaucher. Chaque tâche a un rôle et une capacité prédéfinis. La synthèse démarre uniquement après acceptation des deux checkpoints. Le Core vérifie la remise avant de l’accepter. Le corpus est borné à 10 000 caractères et douze expressions. Ces agents déterministes fonctionnent à coût externe nul. Ils évaluent la présence du texte demandé et la concordance des preuves. L’appréciation sémantique d’un document ou la production de code nécessite un autre adaptateur. Aucune intégration de fournisseur IA n’est activée par ce profil.

## Contrat, contexte et trace

La saisie est conservée dans `control_missions`. L’objectif et les critères sélectionnent jusqu’à cinq révisions validées de Project Intelligence. Le plan fige le texte, la version et l’empreinte de ces révisions. Le journal du plan associe aussi la dernière observation Git enregistrée pour le projet, lorsqu’elle existe. L’empreinte du texte saisi identifie séparément le document examiné. La référence Git décrit le dépôt observé et ne certifie pas que le texte fourni provient d’un fichier de ce commit.

Chaque validation produit une entrée dans `control_events`, chaque bail une tentative dans `control_attempts`. Le checkpoint réside dans `control_tasks` avec le résultat structuré, le SHA-256 et l’heure serveur. Le rapport JSON regroupe le contrat, les preuves, le plan, les attributions et les événements. La consultation vérifie le projet autorisé à chaque requête.

## Lancer le worker

Démarrer le Core sur sa boucle locale puis lancer `node --env-file=.env.local scripts/control-worker.ts`. Le superviseur ouvre un processus de confiance par identité runner déclarée. Chaque processus reçoit sa propre clé et l’origine HTTP locale. Pour sélectionner une seule identité, définir `A1_RUNNER_ID` au lancement. L’adresse par défaut utilise `A1_PORT`. La portée du runner correspond au projet et au rôle de sa clé locale. Les processus enfants quittent la boucle quand la liaison IPC avec le superviseur est fermée.

Les identités sans processus actif restent hors ligne dans Office après expiration de la fenêtre de présence. Un worker démarré sans mission signale sa présence mais ne fabrique aucune activité. Les deux rôles d’un projet doivent être disponibles pour terminer le plan.

## Limites et reprise

- Quatre attributions actives globales, deux par projet, au plus deux par mission et une par identité. Au plus 32 missions ouvertes par projet. Les commandes, la sélection et l’attribution sont ordonnées par un verrou transactionnel PostgreSQL. Le coût externe de chaque mission reste fixé à zéro.
- Durée murale de 1 à 60 minutes, mesurée à partir de l’autorisation d’exécution. Le bail de 20 secondes peut être rafraîchi par son seul titulaire pendant sa validité. Un retour après expiration, suspension ou remplacement est refusé.
- Une pause interrompt les baux actifs et préserve les checkpoints acceptés. La reprise réattribue les tâches à terminer. Trois échecs de la même tâche ou un délai dépassé bloquent le plan et retirent les autres attributions.
- Une relance recopie le périmètre dans un nouveau brouillon relié à son parent. Les formulaires transmettent une clé de commande et la révision affichée. Un rejeu à l’identique rend le même identifiant, une action concurrente sur une révision périmée demande une actualisation.
- Une restauration place les missions actives en quarantaine, interrompt leurs baux et efface les présences obsolètes. Leurs checkpoints et leur historique restent consultables. Une nouvelle exécution demande une relance opérateur.

## Interface HTTP

Les opérations s’appuient sur les mécanismes de session et d’identité locale du Core. Les formulaires HTML reprennent le contrôle d’origine du Studio. Les routes JSON attendent le bearer correspondant au rôle.

| Route | Usage |
|---|---|
| GET/POST `/api/projects/{project}/control` | Lister les missions et le profil. Créer un brouillon avec `commandKey`, `objective`, `scope`, `constraints`, `document`, `criteria`, `risk`, `durationMinutes`. |
| GET `/api/projects/{project}/control/{id}` et `/report` | Consulter ou exporter le rapport persistant. |
| POST `/api/projects/{project}/control/{id}/{action}` | Actions `edit`, `plan`, `approve`, `reject`, `pause`, `resume`, `cancel`, `relaunch`. Clé UUID et révision requises. Les décisions, l’annulation et la relance demandent `confirm=yes`. |
| POST `/api/runner/control/claim` | Signaler sa présence puis demander une tâche compatible. Une file vide renvoie `assignment: null`. |
| POST `/api/runner/control/heartbeat` | Présenter `attemptId` et `generation` pour renouveler un bail. |
| POST `/api/runner/control/complete` | Fournir la même attribution et son `result`. Une remise identique déjà acceptée reste idempotente. |

Les tests dans `test/control-room.test.ts` créent des bases temporaires isolées. Ils exercent les décisions, les attributions parallèles, les limites, les refus d’accès, les preuves, la mise en quarantaine et une exécution via le vrai HTTP du Studio. Depuis le checkout de recette configuré, lancer `node --env-file=.env.local --test test/control-room.test.ts`.
