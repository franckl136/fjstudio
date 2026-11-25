# Décisions et arbitrages à valider

**25 novembre 2026 · revue contradictoire.** Confiance sur la recommandation de conception, indépendamment de la preuve en production. Chaque décision reste proposée.

## Quatre lectures

- **Architecte favorable.** PostgreSQL concentre les invariants. Deux runners découpent la confiance des exécutions. Les intégrations et plans avancés évoluent par contrats sans déplacer l'état métier.
- **Architecte critique.** La file est couplée à la base. La progression dépend des preuves et l'autonomie ne résout ni une ambiguïté distante ni un plan de mauvaise qualité. Éprouver les pannes avant l'enrichissement A2/A3.
- **Sécurité.** L'expéditeur survivant, le contexte opaque et le runner compromis sont les cas dominants. Une approbation dans le Studio ne protège pas une chaîne qui délivre indépendamment les droits de production.
- **Exploitation.** La sauvegarde, l'alerte indépendante, l'identité GitHub et les modèles ont des cycles de maintenance différents. Une seule personne doit pouvoir restaurer et expliquer un blocage avec une procédure conservée hors hôte.

## Dix décisions exposées

| ID | Problème et conséquence | Alternative | Recommandation et confiance | Arbitrage propriétaire |
|---|---|---|---|---|
| D01 | A2/A3 libre peut consommer sans progrès et fragiliser la preuve | A1 strict ou A2 immédiatement | A1 d'abord, adapter seulement le futur sous plafond après corpus comparé. Haute | Adopter le parcours A1 et les seuils de sortie |
| D02 | Base et file partagent saturation et arrêt | Table d'envoi seule, Temporal | pg-boss en transaction et balayage métier, repli table d'envoi. Moyenne avant compatibilité | Niveau de capacité et effort de maintenance |
| D03 | Un envoi admis peut partir après révocation ou restauration | Refus de tout effet, fencing distant | Mode fermé jusqu'à preuve d'arrêt et réconciliation. Effets non réconciliables exclus de l'automatisme. Haute | Autoriser classes d'effets et règles de compensation |
| D04 | VPS unique indisponible pendant restauration | Second site automatique ou seconde instance froide | VPS unique, copie externe et exercice hors hôte. Moyenne avant test | RPO/RTO et coût de l'indisponibilité |
| D05 | Une VM PC peut perdre l'état en veille ou subir une compromission | CI externe, hôte dédié | Runner PC isolé, runner VPS de confiance, preuve distincte si nécessaire. Moyenne | OS, installation autorisée ultérieurement et seconde preuve |
| D06 | Sorties opaques et budgets groupés peuvent dépasser les garanties | API directe, local, parcours manuel | Aucun cloud par défaut. Qualification pratique avant délégation de données ou dépense. Haute | Destinations admissibles, plafond et autorisation pilote |
| D07 | Une source retirée peut survivre dans un index, contexte ou backup | Purge physique systématique ou filtres seuls | Révocation logique immédiate, suivi des dérivés, purge sélective et replay des retraits. Moyenne | Durées, restauration et partage inter-projets |
| D08 | Auteur et vérificateur peuvent dépendre du même environnement | Seconde preuve, revue humaine | Référentiel épinglé hors candidat et politique de confiance par classe. Haute | Contrôles exigeant seconde frontière et règles de dérogation |
| D09 | App d'écriture ou approbation Studio seule contourne la chaîne réelle | Lecture seule durable, connecteur séparé | G0 MVP, publication humaine. G2 seulement après protection réelle et identité dédiée. Haute | Forfait, chaîne de production et décideur |
| D10 | Une sonde ou notification locale ne voit pas la perte du serveur | Sonde externe, surveillance humaine seule | Sonde indépendante minimale avec canal testé. Moyenne | Canal, destinataire, exposition et coût mensuel |

Les décisions D01/D04/D05/D08/D09 précèdent la validation du MVP. D06 autorise éventuellement des pilotes. D07 et D10 exigent une réponse avant mise en service. Les preuves requises sont suivies dans [01](01-matrice-exigences-et-acceptation.md), les risques dans [15](15-registre-des-risques.md).
