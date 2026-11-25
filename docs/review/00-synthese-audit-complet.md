# Synthèse de l’audit complet

**25 novembre 2026 · proposition à valider.** La base vérifiée sur GitHub est main au commit 61490adddd45ed8f3208d368c3f8d326023449fb. Le dossier initial et le README font foi pour décrire l'état antérieur. Les dix documents ont été répartis pour revue par thème, puis rapprochés des exigences et des contrats dans ce dossier. Les recommandations ci-dessous n'autorisent aucune mise en œuvre.

## Verdict

Le socle est suffisamment défini pour préparer un développement en tranches après accord du propriétaire. Les preuves actuelles n'établissent ni exploitabilité 24/7, ni isolation des runners, ni garanties de facturation ou de reprise distante. La première tranche utile est **une mission A1 à deux rôles, limitée à un projet, qui reprend sur preuve après panne et termine avec un verdict indépendant à 0 € d'IA, avec un second projet de test pour vérifier le cloisonnement**.

| Domaine | Solide dans la base | Ce que cette revue exige avant passage |
|---|---|---|
| Autonomie | Plans bornés, checkpoints, baux | États orthogonaux, génération et époque, reprise selon classe d'effet, échéance et modèle explicite de progrès |
| Collaboration | Spécialistes, contrôle indépendant | Capacité de délégation descendante, livrables typés, preuve de contestation, conflits inter-missions et créneaux équitables |
| Mémoire | Sources, provenance, texte d'abord | Autorisation au moment de l'envoi, révocation des dérivés et évaluation comparée des récupérateurs |
| Fournisseurs | Identité Studio et hébergement facultatif | Fiche de qualification par profil, séparation coût/effet et refus explicite d'un secours malgré sa disponibilité |
| Qualité et UX | États fondés sur les événements et preuves | Verdict par hash et base de confiance, dérogation bornée, fraîcheur et vues accessibles |
| Exploitation | VPS unique, copie externe et isolation PC | Sonde hors hôte, inactivation réelle de l'ancien émetteur, restauration en deux objectifs et capacité mesurée |
| GitHub et isolation | Lecture seule, App ciblée | Import paginé et reprise, modèles par projet, identité d'écriture future séparée et preuve de protection côté dépôt |

## Impacts de la revue

1. Une révocation coupe les futures admissions. L'intervalle entre admission et effet distant doit être affiché et traité comme risque de réconciliation.
2. Une preuve négative de l'opération externe n'est recevable qu'après qualification de la source, de son délai d'indexation et du sort du précédent expéditeur.
3. Le RTO de consultation et la réouverture de sorties externes sont mesurés séparément. Un budget restauré plus ancien ne permet pas une nouvelle dépense avant rapprochement.
4. Le MVP standardise les preuves et la coordination. A2 et A3 s'ajoutent via les mêmes contrats après évaluation sur le même corpus.
5. Un moteur opaque, une preuve du candidat, une présence runner ou un calcul tarifaire améliorent l'information. Ils ne constituent respectivement ni contexte exhaustif, ni verdict indépendant, ni arrêt prouvé, ni facture.

## Parcours de revue

| Documents | Question |
|---|---|
| [01 Matrice](01-matrice-exigences-et-acceptation.md), [02 Lacunes](02-audit-contradictions-et-lacunes.md) | Que doit prouver le système et quels écarts traiter ? |
| [03 Exécution](03-architecture-autonomie-et-execution.md), [04 Agents](04-architecture-multi-agents.md), [05 Mémoire](05-memoire-et-apprentissage.md), [06 Fournisseurs](06-fournisseurs-et-strategie-failover.md) | Comment organiser, reprendre, apprendre et remplacer un moteur ? |
| [07 Menaces](07-security-threat-model.md), [08 Qualité et exploitation](08-quality-lab-et-observabilite.md), [09 Interface](09-ux-command-center-agent-office.md) | Comment limiter les pouvoirs, prouver et superviser ? |
| [10 Architecture](10-architecture-technique-et-deploiement.md), [11 Recette](11-scenarios-de-recette-et-tests.md), [12 Budget](12-budget-et-scenarios-economiques.md) | Quelles interfaces, quelles mesures et quels coûts ? |
| [13 Arbitrages](13-decisions-et-arbitrages-a-valider.md), [14 MVP](14-roadmap-et-definition-du-mvp.md), [15 Risques](15-registre-des-risques.md), [99 Checkpoint](99-checkpoint-de-travail.md) | Quelles décisions et quel point de reprise ? |

**Maturité.** Conception testable pour A1, sous réserve des critères de passage. Intégration réelle encore non qualifiée. A2/A3, changement de fournisseur en production, RPO/RTO et déploiement protégé restent des hypothèses. Les résultats isolés figurent dans [11 Recette](11-scenarios-de-recette-et-tests.md).
