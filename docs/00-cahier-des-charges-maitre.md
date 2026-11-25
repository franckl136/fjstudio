# Folk & Joy Studio — cahier des charges maître

**Proposition de révision du 25 novembre 2026.** Toute décision nouvelle présentée ici reste soumise au propriétaire. Ce dossier consolide les propositions précédentes et développe leurs contrats vérifiables.

## Décision générale recommandée

Construire d'abord un **Studio autonome sans IA sur plans bornés**. Il choisit les ressources admissibles, enchaîne les étapes, conserve ses preuves, contrôle les permissions et clôture ou suspend une mission avec un motif. Le plan libre puis la révision dynamique se greffent sur les mêmes contrats. Le propriétaire conserve l'autorité sur les actions sensibles, les données transmissibles et les dépenses.

| Exigence | Engagement de conception | Preuve d'acceptation |
|---|---|---|
| Comprendre un objectif | A1 choisit et paramètre un modèle. A2 propose un graphe validable à partir d'un objectif libre | Un plan dérivé qui contient des compétences, étapes et preuves réalistes est admis. Un plan cyclique ou hors pouvoir est rejeté |
| Former une équipe | Profils permanents et temporaires versionnés. Composition déterminée par besoin, compétence, coût, disponibilité et séparation minimale des rôles | Un auteur ne contrôle pas son propre verdict. Un profil absent entraîne une attente motivée |
| Exécuter et poursuivre | Le Studio applique les transitions et réveille la suite après un checkpoint accepté | Incident entre checkpoint et réveil récupéré. Le PC hors ligne ne bloque pas le VPS |
| S'adapter et terminer | L'enveloppe fixe le progrès attendu, les limites cumulées et les blocs humains | Une stratégie valide modifie seulement l'avenir. Une répétition sans progrès s'arrête et explique le motif |
| Coopérer | Dépendances et livrables typés, sans extension de droits lors d'une délégation | Deux correctifs isolés, un résultat assemblé contrôlé et une décision humaine si conflit ambigu |
| Protéger données et dépenses | Autorisation courante, accès par projet, courtier d'outils, réservation atomique et réconciliation | Un nouvel outil, coût ou destinataire hors enveloppe est refusé même si un agent le demande |
| Vérifier indépendamment | Quality Lab lié au commit et au référentiel, avec preuve et niveau de confiance | Un mauvais contrôle ou une preuve manquante ne délivre pas de verdict positif |
| Capitaliser | Un apprentissage proposé devient une révision sourcée et validée | Contradictions explicites, historique, expiration et révocation effective avant réemploi |
| Rester portable | L'identité, la politique, le contexte et les checkpoints résident dans le Studio | Une étape reprend sur un autre moteur ou en mode déterministe, selon ses capacités |
| Opérer en continu | Deux runners, sauvegardes externes, sonde hors VPS et reprise suspendue des effets | RPO 24 h et RTO 4 h démontrés sur volume cible, plus une date de réouverture des effets |
| Rendre l'activité compréhensible | Cinq modules, stations d'agents et détails d'attente liés aux événements | Même état et indication de fraîcheur sur mobile et ordinateur |

## Carte du dossier

| Document | Contenu |
|---|---|
| [01 Architecture et données](01-architecture-et-donnees.md) | Architecture fonctionnelle et technique, modèle de données, contrats transactionnels, GitHub et artefacts |
| [02 Autonomie et agents](02-autonomie-et-agents.md) | A1–A3, orchestration, sélection, collaboration, blocages, progrès et limites |
| [03 Mémoire et apprentissage](03-memoire-et-apprentissage.md) | Mémoire de mission et durable, apprentissages, provenance, recherche et rétention |
| [04 Fournisseurs et moteurs](04-fournisseurs-et-moteurs.md) | API, CLI, SDK, contrôle des coûts, licences et qualification no-code |
| [05 Expérience et Agent Office](05-experience-et-agent-office.md) | Cinq modules, navigation, références UI, stations, accessibilité et recette |
| [06 Qualité et observabilité](06-qualite-et-observabilite.md) | Quality Lab, résultats indépendants, traces, incidents et alertes |
| [07 Sécurité, runners et résilience](07-securite-runners-et-resilience.md) | Permissions, isolation, baux, menace, sauvegarde et restauration |
| [08 Infrastructure, roadmap et recette](08-infrastructure-roadmap-et-recette.md) | Coûts, alternatives, phases et tests d'acceptation |
| [09 Vérifications, risques et checkpoint](09-verifications-risques-et-checkpoint.md) | Simulations réellement exécutées, limites, décisions et reprise de travail |

## Corrections structurantes

1. Le progrès d'une mission est établi par ses résultats vérifiés. Une sortie nouvelle, un tour supplémentaire ou un changement de modèle ne justifient pas une relance en eux-mêmes.
2. Les plafonds d'autonomie englobent la durée, le nombre d'étapes, les tentatives, les révisions et les dépenses. Les compteurs traversent les versions de plan. Le profil pilote chiffré dans le document 02 est une hypothèse plus restrictive que le dossier maître, à comparer sur un corpus.
3. Un effet externe garde une clé indépendante de la tentative. Un bail échu, une fin locale ou un reçu perdu laissent des questions différentes. Le Studio exige une preuve suffisante avant d'autoriser un autre expéditeur.
4. Les apprentissages d'agent restent des propositions reliées à des preuves. Ils ne deviennent ni des faits ni des pouvoirs par répétition.
5. Le Quality Lab sépare le référentiel, la source de preuve et l'autorité qui conclut. L'interface expose les limites de confiance et la fraîcheur des résultats.
6. L'Agent Office MVP reçoit une identité par stations 2D simples, exploitables au clavier et en liste. La vue suit les événements. L'isométrique attend un besoin observé.

## Suite après validation

La base VPS-2 et BX11 est estimée à 12,49 € TTC par mois, avec budget IA initial de 0 €. Le VPS est aux tarifs publics de départ. Le prix du BX11 demeure à confirmer. Le PC, la chaîne de production, la restauration réelle et les comptes fournisseurs sont des prérequis de qualification, hors des vérifications de cette mission.

L'étape suivante est un inventaire de Folk & Joy, de la chaîne de production et du PC. La publication documentaire ne vaut ni validation des propositions ni autorisation de commencer la réalisation.
