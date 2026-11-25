# Architecture multi-agents

**Recommandation à valider · 25 novembre 2026**

La collaboration porte sur des résultats contrôlables. Un coordinateur Studio compose des rôles à partir du plan et des permissions, puis admet et ordonne les dépendances. Les agents émettent des propositions et des livrables. L’[autonomie et l’exécution](03-architecture-autonomie-et-execution.md) s’appliquent à chacun de leurs travaux. Ce document prolonge le [dossier d’autonomie initial](../02-autonomie-et-agents.md) avec des règles de sélection, de contestation et de conflit entre missions.

## 1. Rôles, durée et autorité

| Rôle | Durée ou mutualisation proposée | Livrable et limite d’autorité |
|---|---|---|
| Coordinateur principal | Fonction permanente du Studio, appliquée par projet | Vérifie le graphe, affecte ressources et rôles, applique les politiques et agrège les preuves. Les décisions sensibles restent humaines |
| Architecte | Profil permanent, déclenché quand une décision traverse plusieurs modules ou un contrat public | Option recommandée, contre-option, impacts et conditions de révision. Un changement de portée reste une proposition |
| Développeur | Profil permanent déclinable sur un projet. Une tentative et un espace isolé par travail | Correctif, diff par fichier, commit de base, contrôles locaux et limites. Aucune écriture de publication au MVP |
| Auditeur qualité | Profil permanent ou mutualisé sous mandat propre au projet | Contrôle du candidat sur référentiel indépendant. Le verdict vient du Quality Lab |
| Expert sécurité | Profil spécialisé partagé au niveau du catalogue et affecté ponctuellement | Analyse défensive, conditions d’isolement et exceptions à soumettre. Aucun accès implicite aux autres projets ou à la production |
| Analyste | Permanent pour un domaine fréquent ou temporaire pour un objectif | Faits, hypothèses séparées, sources et modèle de décision |
| Documentaliste | Profil mutualisable, affecté par projet | Documentation proposée, liens et provenance. Le partage d’une leçon privée suit une revue distincte |
| Expert temporaire | Rôle créé depuis une version approuvée, limité à la mission et à son horizon | Réponse ciblée au mandat avec niveau de confiance et preuves. L’expiration ferme sa capacité d’exécution |

Un profil permanent possède une identité stable et des versions. Une affectation possède un mandat immuable lié à projet, mission, nœud et tentative. Le Studio n’accorde aucun droit par la seule présence d’un libellé de compétence. Un agent mutualisé reçoit des mandats distincts. Sessions, fichiers, preuves et caches restent séparés. Une qualification expirée empêche une nouvelle affectation et provoque la réévaluation des tentatives concernées.

## 2. Allocation intelligente

**Filtrer d’abord** les candidats par compétence qualifiée, indépendance requise, politiques de données, capacité moteur, règles d’outil, runner, état fournisseur, plafond et date butoir. Les caractéristiques du modèle et du fournisseur s’évaluent au niveau de la version d’adaptateur. Une session disponible n’améliore aucune autorisation. Un candidat inéligible reçoit une catégorie de refus. Le tri des candidats admissibles conserve sa version et le motif du choix. [Moteurs et qualification](06-fournisseurs-et-strategie-failover.md)

**Classer ensuite.** Pour le pilote, employer un ordre explicable. Compétence et preuve adaptées au mandat. Niveau de raisonnement suffisant pour le type de travail. Coût de la tentative, délai attendu et attente runner. Stabilité observée sur des tâches comparables. Départager de manière déterministe et conserver l’identifiant des mesures. Les mesures d’un projet n’ouvrent aucun accès à ses données. La difficulté à estimer la qualité impose un statut « non mesuré » et une recette ciblée, avec repli manuel ou déterministe.

| Charge | Affectation usuelle |
|---|---|
| Contrôle à règle exacte ou comparaison de deux empreintes | Worker ou runner déterministe. Aucun appel modèle |
| Synthèse de sources autorisées et structurées | Un profil de synthèse, contexte compact et modèle qualifié à budget borné |
| Décision d’architecture à effets importants | Production de deux options argumentées, avis indépendant proportionné au risque et décision humaine si elle change les pouvoirs |
| Construction et vérification d’un candidat | Auteur en environnement isolé, référentiel et exécution de contrôle séparés |

Le coordinateur choisit le plus petit ensemble de mandats qui satisfait les livrables et l’indépendance. Il choisit l’agent et les exigences d’exécution avant de fixer un fournisseur. Un budget augmente uniquement sous la politique approuvée. Le créneau et la réserve se décident à l’attribution effective. Les priorités appartiennent au Studio, avec tour des projets et vieillissement définis dans le [contrat d’exécution](03-architecture-autonomie-et-execution.md).

## 3. Collaboration, dépendances et délégation

Le protocole utilise des livrables typés. Chaque livrable porte son type, auteur, mandat, cible, version de base, provenance, empreintes, classification, données consommées, conclusion et limites. Un geste de collaboration correspond à une dépendance ou une demande d’expertise durable. Un contexte partagé est une référence autorisée à un lot figé. Le Studio contrôle qui peut le voir, y compris quand des agents appartiennent à la même équipe. [Contrat de mémoire et de contexte](05-memoire-et-apprentissage.md)

| Échange | Usage | Traitement |
|---|---|---|
| Résultat | Proposition d’architecture, patch, checklist, preuve de test | Contrôle de schéma et de provenance, puis revue quand nécessaire |
| Expertise | Question précise et preuve attendue | Le coordinateur vérifie que l’enveloppe couvre un nœud et un mandat supplémentaires |
| Contestation | Risque, preuve ou alternative opposée à une décision | Décision durable et circuit de revue indépendant |
| Blocage | Accès, dépendance, divergence, délai, coût ou ressource indisponible | Assigner le déblocage si admissible, attendre ou clôturer avec état motivé |
| Décision | Choix, motif, versions comparées, risques acceptés | Autorité humaine ou politique vérifiable selon la classe. Le coordinateur lie la preuve de décision au plan |

Une délégation possède une profondeur maximale, un plafond de nœuds et un motif. Qualifier chaque relation par identité de parent et lignée. Rejeter réattribution identique en cours, même ressource et même preuve demandée dans une chaîne qui reboucle, et réapparition sous un nouveau nom si elle dépasse le compteur. Un demandeur ne transmet jamais son jeton, son budget ou son rôle. Une dépendance entre missions MVP consomme un résultat identifié et approuvé. Elle ne déclenche pas de sous-mission implicite. Une future dépendance dynamique exige un graphe d’attente inter-missions surveillé et l’absence de cycle. Ne jamais garder un verrou d’exécution en attendant un agent.

## 4. Revue contradictoire

1. Le coordinateur fige les versions et décrit la question. La revue reçoit le mandat, les critères et les preuves autorisées. Pour une décision importante, produire un avis initial à partir des sources avant lecture de la conclusion de l’auteur afin de limiter l’ancrage.
2. Le relecteur produit l’objection, le critère concerné, la preuve, sa limite et une alternative ou une question vérifiable. L’auteur répond avec une preuve supplémentaire ou rétracte la proposition.
3. Le coordinateur classe l’objection par gravité et déclenche au plus un aller-retour supplémentaire dans le pilote. Une objection bloquante non résolue suspend le verdict. Une alternative hors enveloppe passe par approbation.
4. Le Quality Lab conclut sur les contrôles applicables. Une contestation de politique ou un risque restant hors compétence est transmis à une personne habilitée. Les désaccords durablement ouverts apparaissent dans le rapport.

**Critère d’indépendance.** Auteur et relecteur ne partagent pas le droit de modifier les critères, le verdict ou l’artefact de l’autre. Le référentiel vient d’une source contrôlée et le commit analysé est immuable. Un deuxième avis avec le même modèle peut présenter des erreurs corrélées. Pour une propriété testable, privilégier la preuve déterministe. En cas d’impossibilité de séparer les pouvoirs ou l’environnement, rapporter le contrôle incomplet et ne pas conclure automatiquement sur un critère obligatoire. [Quality Lab](08-quality-lab-et-observabilite.md)

## 5. Conflits de travail et publication

Avant écriture, déclarer projet, dépôt, cible, base et chemins pressentis. Au MVP, un chevauchement connu sur la même base attend. Pour les travaux futurs admis en parallèle, isoler les tentatives. Comparer les changements réels et dépendances de fichier avant l’assemblage. Deux modifications de fichiers disjoints peuvent être incompatibles au niveau d’un schéma ou d’un contrat. Un résultat assemblé possède une nouvelle empreinte et doit repasser les contrôles. L’acceptation de chaque fragment ne porte pas sur le commit résultant.

L’unicité porte sur l’action en cours dans le périmètre réel de la ressource externe. Deux missions et même deux projets sur un dépôt partagé doivent converger vers une clé canonique du dépôt et de la référence. Le MVP peut refuser de rattacher le même dépôt GitHub en écriture à deux projets. La publication reste humaine au MVP. Quand une autorisation d’écriture est ajoutée, une tête concurrente, une révision ou une révocation invalide l’approbation antérieure selon la politique. Réconcilier les effets incertains avant nouvelle expédition.

**Alternative documentée, consultée le 25 novembre 2026.** Git fournit des opérations de montage d’arbres de travail et de calcul de fusion. Un worktree implique des métadonnées communes et ne constitue pas une barrière d’isolation. Les modèles de délégation d’OpenAI Agents SDK ou LangChain sont candidats à la composition interne d’une tentative. Leur délégation doit produire des résultats dans les contrats de mission et rester soumise aux politiques Studio. [Git worktree](https://git-scm.com/docs/git-worktree), [Git merge-tree](https://git-scm.com/docs/git-merge-tree), [Agents SDK](https://openai.github.io/openai-agents-js/guides/multi-agent/), [LangChain multi-agent](https://docs.langchain.com/oss/javascript/langchain/multi-agent)

## 6. Recette et arbitrages

| Cas | Résultat attendu |
|---|---|
| Agent bloqué avant livraison | Le coordinateur lit le motif durable et choisit attente, replanification admissible ou arrêt. Aucun autre agent ne prend implicitement son autorité |
| Deux acteurs répondent au même mandat | Un seul résultat fait évoluer l’étape. Les autres restent des observations ou propositions de revue |
| Conflit après deux diffs disjoints en apparence | L’assemblage s’arrête ou produit un nouveau candidat à contrôler. Aucun verdict fragmentaire n’autorise sa publication |
| Auteur tenant aussi le référentiel | Le score de compétence est sans effet. Le candidat est inapte à recevoir un verdict indépendant |
| Planificateur demande une délégation circulaire | Rejet motivé. Ni nouvelle tentative ni droit supplémentaire |
| Projet bruyant avec autre projet éligible | L’admission respecte les créneaux, l’ancienneté et l’équité mesurée |
| Deux analyses contradictoires | Preuves et critères restent visibles, avec résolution ou arbitrage. Aucune majorité de sorties IA ne fixe le verdict |

À arbitrer. Profils permanents à entretenir, profondeur de délégation, seuils d’objection et niveau d’indépendance exigé pour une décision de production. La [recette globale](11-scenarios-de-recette-et-tests.md) doit éprouver les courses et l’isolation. Les exemples ci-dessus sont des spécifications de recette.
