# Registre des risques

**25 novembre 2026 · évaluation qualitative proposée.** Probabilité et impact en faible, moyen ou élevé. Les échelles sont ordinales, sans fréquence mesurée. Le niveau résiduel suppose les mesures appliquées et testées.

| ID | Risque | Prob. / impact | Détection | Mitigation et responsable | Résiduel |
|---|---|---|---|---|---|
| R01 | Effet distant double après réponse perdue | Moyen / élevé | Reçus absents, clé déjà connue, rapprochement | Clé stable, preuve et blocage. Orchestrateur | Moyen si autorité distante incomplète |
| R02 | Ancien hôte continue après restauration | Faible / élevé | Sessions concurrentes, époque et activité hors hôte | Isolation réseau, révocation, preuve avant reprise. Exploitant | Moyen si opération en vol |
| R03 | Fuite inter-projets via index ou artefact | Moyen / élevé | Tests négatifs, accès refusés, révisions | RLS, filtres avant classement et envoi, liens courts. Sécurité | Faible à moyen, rôle système |
| R04 | Accès imprévu via code candidat ou données non fiables | Moyen / élevé | Événement de politique, anomalies runner | VM jetable, aucune clé, courtier et réseau minimal. Sécurité | Moyen, hôte compromis |
| R05 | CTA d'approbation trop générale | Moyen / élevé | Cible ou politique modifiée après signature | Empreinte, expiration, preuve de décision, réauthentification. Produit | Faible si chaîne réceptrice prouvée |
| R06 | Dépenses non réconciliées | Moyen / élevé | Réserve âgée, écart fournisseur | Calcul conservateur, clé unique, quatre plafonds, suspension. Exploitant | Moyen, délai de facture |
| R07 | Modèle retire une capacité | Moyen / moyen | Échecs de contrat, changement de version | Profil épinglé, invalidation qualification, repli A1. Responsable intégration | Faible au MVP |
| R08 | Apprentissage faux ou obsolète | Moyen / moyen | Conflit de sources, date de révision | Proposition sans promotion automatique, preuve, révocation. Qualité | Moyen, erreur sémantique |
| R09 | Critères qualité manipulables | Moyen / élevé | Désaccord de hash, test manquant | Référentiel indépendant et confiance exigée. Qualité | Moyen, test à couverture insuffisante |
| R10 | Perte de fichiers de sauvegarde ou de clés | Faible / élevé | Vérification externe, exercice | Copie chiffrée et accès indépendants de l'hôte. Exploitant | Moyen avant exercice |
| R11 | Arrêt VPS, DB ou queue | Moyen / élevé | Sonde indépendante, retard de file | Mode fermé, sauvegarde, reprise progressive. Exploitant | Moyen, VPS unique |
| R12 | Saturation disque, RAM ou PC | Moyen / moyen | Seuils, backlog par projet et temps de tour | Limites d'artefact, quotas, rétention et mesure. Exploitant | Moyen si pics prolongés |
| R13 | Notifications et projection trompeuses | Moyen / moyen | Âge de signal et d'événement, test de coupure | Fraîcheur visible et alerte hors serveur. Produit | Faible à moyen, canal externe |
| R14 | Autorité GitHub plus large que le parcours permis | Moyen / élevé | Revue permissions, logs et test de droits | App lecture seule, identité distincte pour écriture ultérieure. Sécurité | Faible MVP |
| R15 | Une personne ne parvient pas à restaurer rapidement | Moyen / élevé | Temps de reprise, vérification des accès | Exercice récurrent, procédure hors hôte et relais désigné. Propriétaire | Moyen, disponibilité humaine |
| R16 | Refonte liée à un couplage service ou fournisseur | Faible / élevé | Portabilité de l'export et réutilisation du contexte | Contrats versionnés, exports, qualification des adaptateurs. Architecture | Faible après exercice |

Les propriétaires de risque désignent des responsabilités. Une personne peut en assumer plusieurs, sauf séparation obligatoire entre auteur et verdict ou approbateur pour une action donnée.
