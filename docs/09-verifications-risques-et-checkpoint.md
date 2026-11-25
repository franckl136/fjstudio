# Vérifications exécutées, risques et checkpoint

Proposition du 25 novembre 2026. Les vérifications utilisent des données synthétiques, hors dépôt. Les observations tirées de la documentation, les résultats locaux et les hypothèses d'intégration ont des niveaux de preuve différents.

## Résultats de vérification

| Vérification exécutée | Résultat | Portée |
|---|---|---|
| Exploration d'états d'un effet externe, avec annulation, perte de bail, révocation et restauration | 36 états, 97 transitions, aucun double envoi sous les gardes du modèle | Énumération locale d'un modèle fini. Ni source distante ni réseau ni PostgreSQL utilisés |
| Variante négative sans garde de réconciliation après réponse perdue | Répétition atteinte en deux envois | Contre-exemple qui justifie une garde indépendante du bail |
| Réservations atomiques dans un modèle de quatre portées | 24 ordres d'admission, aucun plafond dépassé | Vérification du calcul séquentiel. Le verrouillage et l'isolement réel restent à tester |
| Variante négative avec deux lectures du même solde | Deux appels de 50 et 40 peuvent chacun être admis sur un solde 70, soit 90 ensemble | Justifie vérification et réservation dans une seule transaction |
| Graphe synthétique en diamant et graphe cyclique | Deux ordres valides pour le premier, aucun pour le second | Vérifie les fixtures. Les interruptions et la planification réelles restent à tester |
| Tarification en arithmétique décimale | Totaux VPS et exemples d'inférence cohérents avec les hypothèses publiées | Pas de panier, d'appel IA ni de facture liés à cette vérification |
| Arrêt Linux d'un groupe de processus jetables | Un parent et son enfant ont signalé leur démarrage. SIGTERM au groupe a terminé le parent et fermé le flux partagé en moins de 3 s | Essai local POSIX. Ni veille, ni VM, ni processus détaché ou distant testés |
| Contraste de la palette Office | Six paires de couleurs de station calculées selon la luminance relative WCAG et au-dessus des seuils proposés | Calcul local sur couleurs statiques. Aucune UI ni certification d'accessibilité |

Les tests ne démontrent pas la sûreté de bout en bout. La vérification de l'absence d'un effet réel dépend de l'autorité et des propriétés de la source distante. La sérialisation des réservations et des créneaux, les interruptions et l'isolation exigent des tests d'intégration ultérieurs.

## Contradictions traitées

- Un bail expiré suffit à écarter des mutations tardives. Il ne prouve ni l'arrêt local ni l'absence d'un effet distant. Le périmètre concerné peut rester en quarantaine.
- Une intention locale commitée ne rend pas l'appel distant atomique. La restauration peut même faire disparaître l'intention. Le mode de reprise réconcilie la période postérieure au point restauré.
- Un artefact différent indique seulement que les octets ont changé. A2 et A3 exigent une progression métier et une preuve vérifiée.
- Un moteur qui injecte du contexte non observable n'est pas éligible aux profils qui exigent une inspection exhaustive. Une session propre et l'export des données visibles ne suffisent pas à modifier ce constat.
- La validation par un agent différent n'établit pas l'indépendance si les deux profils dépendent d'un hôte compromis ou du même référentiel modifiable.

## Risques ouverts et décisions propriétaire

| Risque | Priorité | Validation ou preuve attendue |
|---|---|---|
| Approbation de production à démontrer | Haute | Cartographier la chaîne et démontrer le rôle humain dans l'autorité réceptrice |
| PC et outils non qualifiés | Haute | OS, VM, limites, arrêt en veille et prévention des transferts inter-projets |
| Effet distant ambigu ou facturation retardée | Haute | Qualifier la source d'autorité, l'expiration des clés distantes et le protocole de rapprochement |
| Données privées, archives et destination IA | Haute | Décider les catégories, rétentions et destinations. Tester la révocation entre gel du contexte et transmission |
| Perte complète du VPS ou de sa sauvegarde | Haute | Attribuer la responsabilité de la restauration, tester hors du VPS et choisir la couverture indépendante de la copie critique |
| Prix et conditions | Moyenne | Vérifier les prix de renouvellement et le BX11 au panier. Qualifier les comptes avant tout coût IA |
| Replanification trop complexe ou coûteuse | Moyenne | Comparer A1, A2 et A3 sur le même corpus. N'activer A3 que si la qualité utile compense les tours et les reprises |
| Accessibilité, lisibilité et fraîcheur des projections | Moyenne | Tester mobile, clavier, rythme des changements et annonces d'état en conditions réelles |

## Checkpoint de reprise

Les documents numérotés constituent la révision proposée. Les simulations ont été exécutées sur des données synthétiques, sans solliciter les services de Folk & Joy.

La prochaine tâche après décision propriétaire est l'inventaire en lecture seule du premier projet et du PC, puis la qualification du protocole et de la chaîne de qualité sur des données synthétiques. Le chantier de développement attend son autorisation propre.

## Cycles et revue finale

1. Relecture du dossier maître et qualification du périmètre documentaire.
2. Recherche et revue spécialisée des fournisseurs, orchestrateurs, licences, mémoire, références UI et preuves de qualité.
3. Consolidation des contrats A1–A3, des composants, des politiques de dépense, des états Office et de la procédure de reprise.
4. Exécution des essais locaux isolés. Une revue complémentaire a testé 128 combinaisons de sept préconditions d'envoi et 243 séquences de trois stratégies sur une lignée. Ces essais restent des prédicats abstraits.
5. Revue contradictoire et recoupement des contraintes. Liens internes, structure des tableaux, clôtures des blocs et intégrité de l'archive vérifiés localement.

Les vérifications n'ont impliqué aucune modification de compte fournisseur, aucune dépense et aucune modification de code applicatif.
