# Audit des contradictions et lacunes

**25 novembre 2026 · propositions de modifications.** Références relatives au dépôt de base. Aucun document initial n'est modifié par cette revue. « Tension » signifie deux règles à borner ensemble, « lacune » un contrôle non spécifié, « actualisation » une preuve nouvelle.

| ID | Documents concernés | Constat et conséquence | Résolution proposée |
|---|---|---|---|
| E01 | [00](../00-cahier-des-charges-maitre.md), [02](../02-autonomie-et-agents.md) | Tension entre objectif libre et « autonomie MVP ». Une interface pourrait promettre A2 alors que le parcours tourne en A1 | Afficher palier et périmètre. A1 prend un objectif paramétré, A2 propose un plan, A3 ne change que l'avenir dans les limites approuvées |
| E02 | [01](../01-architecture-et-donnees.md), [02](../02-autonomie-et-agents.md), [07](../07-securite-runners-et-resilience.md) | Lacune de linéarisation à la jonction autorisation, envoi et révocation. Le contrôle courant peut expirer après l'envoi | Distinguer admission, dispatch et effet confirmé. Marquer l'incertitude et restreindre les actions risquées jusqu'à réconciliation |
| E03 | [01](../01-architecture-et-donnees.md), [07](../07-securite-runners-et-resilience.md), [09](../09-verifications-risques-et-checkpoint.md) | Une époque locale ne neutralise pas l'ancien hôte hors du plan de contrôle. Une sauvegarde peut perdre une intention déjà exécutée | Isoler l'ancien émetteur, révoquer ses droits, rapprocher l'historique externe et rouvrir par classe |
| E04 | [02](../02-autonomie-et-agents.md), [05](../05-experience-et-agent-office.md) | Tension entre « actif » sous bail et processus réel. Événement tardif ou absence de PC peut falsifier la projection | Champ de fraîcheur et dernier signal. Présence, génération et activité restent distinctes. Aucun effet de mouvement d'après un plan seul |
| E05 | [03](../03-memoire-et-apprentissage.md), [04](../04-fournisseurs-et-moteurs.md) | Contradiction pour les profils qui exigent inspection exhaustive et un CLI qui charge un contexte interne inobservable | Déclarer le périmètre garanti et rendre le profil opaque inéligible |
| E06 | [03](../03-memoire-et-apprentissage.md), [07](../07-securite-runners-et-resilience.md) | Lacune de révocation des index et autres dérivés, notamment après restauration | Filtrer avant classement et avant envoi, garder les références de dépendance et rejouer les retraits après restauration |
| E07 | [06](../06-qualite-et-observabilite.md), [07](../07-securite-runners-et-resilience.md) | Deux agents sur le même hôte ne font pas une preuve à deux frontières de confiance | Un hôte suspect ne peut établir le verdict sensible seul. Réexécution indépendante ou preuve non vérifiée |
| E08 | [04](../04-fournisseurs-et-moteurs.md), [08](../08-infrastructure-roadmap-et-recette.md) | Budget IA nul et bascule cloud ne sont compatibles qu'avec un chemin gratuit garanti ou autorisation ultérieure | Simulation par défaut, aucun compte externe obligatoire, aucune conversion payante implicite |
| E09 | [06](../06-qualite-et-observabilite.md), [07](../07-securite-runners-et-resilience.md), [08](../08-infrastructure-roadmap-et-recette.md) | RTO « service exploitable » ambigu si les écritures sont encore suspendues | Mesurer lecture et diagnostic sous 4 h, tester séparément la reprise des effets par classe et expliciter le temps total |
| E10 | [01](../01-architecture-et-donnees.md), [06](../06-qualite-et-observabilite.md) | GitHub lecture seule ne peut imposer une protection de déploiement en production | Distinguer preuve et contrôle imposé. S'assurer que la chaîne de destination applique l'approbation humaine et que le forfait la permet |
| E11 | [08](../08-infrastructure-roadmap-et-recette.md), [09](../09-verifications-risques-et-checkpoint.md) | Chiffres publics, estimations et tests conceptuels risquent d'être relus comme résultats en service | Conserver le niveau de preuve à côté du nombre. Actualiser la source Hetzner et isoler conditions de panier et renouvellement |
| E12 | [01](../01-architecture-et-donnees.md), [03](../03-memoire-et-apprentissage.md), [08](../08-infrastructure-roadmap-et-recette.md) | Lacune de capacité et de rétention commune. Une purge mémoire peut enlever une preuve référencée par sauvegarde ou rapport | Séparer droits et durée physique, créer manifeste d'objets protégés et déterminer une politique de rétention par catégorie |
| E13 | [02](../02-autonomie-et-agents.md), [08](../08-infrastructure-roadmap-et-recette.md) | Hypothèses de temps, de priorité et de nombre de tentatives non comparées à la capacité du PC | Distinguer enveloppe du pilote A2/A3 et test déterministe D30. Fixer charge, durée et saturation de référence avant recette |
| E14 | [05](../05-experience-et-agent-office.md), [09](../09-verifications-risques-et-checkpoint.md) | Contraste calculé sur six couples ne garantit pas WCAG AA | Couvrir clavier, focus, flux temps réel, zoom et mobile sur produit réel |

## Questions ouvertes en ordre de dépendance

1. Qui peut récupérer le service hors du VPS et où se trouvent les accès de secours ?
2. Quel niveau de preuve peut produire le PC et quelle preuve indépendante exige Folk & Joy ?
3. Quelle chaîne humaine bloque réellement la production ?
4. Quelles données sont admissibles dans chaque mémoire et sur quelle destination ?
5. Quels coûts, tailles, temps d'attente et classes de missions sont acceptables ?
6. Quand autoriser A2 ou une écriture GitHub et comment en démontrer la valeur ?
