# Roadmap et définition du MVP

**25 novembre 2026 · périmètre proposé.** Cette feuille de route ne lance aucune réalisation.

| Jalon | Inclus et livrable attendu | Passage |
|---|---|---|
| J0 Décision | Politique des données, rôle humain production, OS PC, accès de secours, budget et corpus de recette | Propriétaire tranche les décisions bloquantes dans [13](13-decisions-et-arbitrages-a-valider.md) |
| J1 Socle | Identités, PostgreSQL, projets, politiques, audit, export et sauvegarde | Isolation testée de bout en bout. Restauration vierge chronométrée |
| J2 Exécution A1 | Plans paramétrés et versionnés, rôles, baux, créneaux, checkpoints, annulation, cas répétables et quarantaine | T01–T04, concurrence et reprise sur deux projets et deux runners |
| J3 Dossier d'un projet | GitHub G0, connaissances lexicales et sourcées, Quality Lab, écrans de supervision et Agent Office par stations | T06–T14 et collecte lecture seule. Mobile et clavier, zéro appel IA |
| J4 Pilote facultatif | Ollama ou API directe sous homologation, A2 en proposition de plan et budget autorisé séparément | Mesurer qualité et coût sur corpus identique à A1. Refus de secours incompatible |
| J5 Extension | A3 borné après preuve de valeur, éventuellement GitHub G2 et moteur CLI | Accord dédié par capacité, aucun élargissement automatique. Fusion et production distinctes |

**MVP terminé = J1 à J3 et tous les P0 validés.** Le produit permet à un opérateur de sélectionner un commit, lancer un plan A1 avec deux rôles, reprendre sur preuve après interruption et consulter un verdict indépendant. Un second projet synthétique démontre le cloisonnement et l'équité. Le PC hors ligne apparaît comme capacité attendue et ne bloque pas la partie VPS. Les opérations ambiguës demandent une décision explicite. Les preuves de sortie sont exploitables depuis un ordinateur et un mobile.

**Hors MVP.** Décomposition d'un objectif libre, replanification autonome, modèles payants, écriture GitHub, merge, déploiement automatique, orchestration Kubernetes, réplication haute disponibilité, base vectorielle séparée et bureau isométrique. Les interfaces et registres du socle préservent leur évolution sans les imposer à l'exploitation initiale.

**Rapport de passage.** Pour chaque P0 indiquer preuve, environnement et dépendances. Une absence de preuve bloque le passage ou exige une nouvelle décision de périmètre. Au moins un exercice démontre le seul cas entièrement opérationnel envisagé, avec zéro dépense IA, et les alertes accessibles hors hôte.
