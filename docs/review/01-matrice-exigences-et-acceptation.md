# Matrice des exigences et de l’acceptation

**25 novembre 2026 · proposition.** P0 bloque le MVP, P1 est une extension conditionnelle, P2 attend une preuve de valeur. Les seuils chiffrés sont des cibles à homologuer sur un corpus fixé. La colonne preuve indique une vérification à réaliser sauf mention d'un résultat local dans [11](11-scenarios-de-recette-et-tests.md).

| ID | Exigence | Priorité | Acceptation mesurable | Vérification et dépendance |
|---|---|---|---|---|
| A-01 | Intake, qualification puis plan A1 | P0 | Pour un objectif incompatible, un motif de refus et zéro attribution. Pour un plan valide, toutes les tâches obligatoires disposent de preuve ou de blocage explicite | Fixture avec plan valide et cycle, catalogue et politique |
| A-02 | Checkpoint, reprise et horizon | P0 | 30 étapes, interruption après 15. Aucun checkpoint perdu, au plus une tentative contrôlante par étape et mutation d’une ancienne génération refusée et aucune admission à partir de l'échéance | D30 local puis essai de redémarrage réel |
| A-03 | Effets externes | P0 | Effet confirmé côté destination avec reçu local perdu. Zéro nouvel envoi tant que l'issue reste incertaine | Double de connecteur puis intégration autorisée |
| A-04 | Missions récurrentes | P0 | Retard et rejeu d'une même occurrence produisent au plus une mission. Limite de rattrapage affichée | Horloge contrôlée et arrêt du worker |
| A-05 | Plan libre et adaptation | P1 | Cycle, augmentation de droits, ou budget hors enveloppe refusés. Une révision conserve preuves et compteurs | Comparatif A1/A2/A3 sur corpus identique |
| B-01 | Travail multi-agents | P0 | Auteur, vérificateur et coordinateur ont des responsabilités séparées. Deux candidats incompatibles bloquent l'assemblage | Fixture multi-rôles, résultat et objection structurés |
| B-02 | Concurrence et équité | P0 | Un écrivain autorisé par portée de ressource et un créneau suivant la règle d'équité. Chaque projet continuellement admissible obtient un tour sous contention bornée | Six permutations en modèle, puis établissements simultanés PostgreSQL |
| C-01 | Contexte limité et sourcé | P0 | Chaque extrait porte version, provenance, classification et périmètre. Une révocation après gel provoque une nouvelle évaluation avant départ | Jeu de documents et accès retirés entre étapes |
| C-02 | Mémoire durable et apprentissage | P0 | Une proposition rejetée ne rejoint jamais le corpus autorisé. Une source révoquée invalide les paquets dépendants pour les futurs appels | Rejeu index, API et artefacts |
| C-03 | Recherche hybride | P2 | Gain de rappel à précision et filtrage comparables sur un corpus annoté, sans régression de confidentialité. Objectif à choisir après mesure lexicale | Évaluation hors production, seuil propriétaire |
| D-01 | Fonctionnement sans fournisseur | P0 | Sans compte, clé ni IA, le scénario de référence se clôture avec preuve et total IA de 0 € | Parcours complet avec accès externe modèle désactivé |
| D-02 | Qualification de secours | P1 | Aucun secours si une garde de droits, capacité, budget, destination ou effet bloque. Checkpoint reconstructible indépendamment de la session externe | Matrice de 128 cas en modèle, tests de contrat par moteur |
| D-03 | Budget cumulatif et réservation | P0 | En concurrence, plafond respecté sur les quatre portées. Une clé répétée ne crée aucun nouvel engagement. Timeout garde sa réserve | Modèle SQLite puis concurrence réelle PostgreSQL et faux usage distant |
| E-01 | Supervision et accessibilité | P0 | À 320 px CSS et au clavier, comprendre la cause d'un blocage, consulter preuve et décider. Site de test avec projets révoqués et événements tardifs | Recette manuelle et automatisée, données expurgées |
| E-02 | Agent Office fidèle | P0 | Déconnexion, collaboration et état actif découlent des événements pertinents. Visuel et liste convergent en moins de deux cycles de projection | Matrice des événements, test de retard et reprise |
| F-01 | Verdict reproductible | P0 | Chaque rapport désigne projet, commit, référentiel, environnement, tests et empreintes. Preuve requise absente bloque | Référentiel indépendant et candidat trompeur synthétique |
| F-02 | Dérogation traçable | P0 | Autorisée sur un contrôle et un commit, avec durée et décideur. Une nouvelle cible ou une expiration la rend inapplicable | Test calendrier et changements de cible |
| G-01 | Isolation et moindre privilège | P0 | Zéro accès inter-projets sur recherche, API, artefact, journal et runner. Une révocation bloque la prochaine admission | Deux projets, rôles PostgreSQL réels et connexions réutilisées |
| G-02 | Runner PC hors ligne | P0 | Aucun port entrant PC. Une interruption PC ne bloque pas les travaux VPS. Ancienne génération rejetée, arrêt ambigu en quarantaine | Tests VM, veille, réseau, Windows/macOS/Linux selon machine |
| G-03 | Actions sensibles | P0 | Approbation liée à action, cible et version politique, sans clés de production dans les jobs. Contrôle des nouvelles sorties après révocation | Vérifier la chaîne humaine de production séparément |
| H-01 | Exploitation et incident | P0 | Coupure totale détectée depuis l'extérieur. Un incident explique projet, causalité, heure et action humaine attendue | Destination d'alerte approuvée et essai de panne |
| H-02 | Sauvegarde et restauration | P0 | Sur corpus cible, RPO ≤24 h et RTO lecture ≤4 h. Délai de reprise des effets rapporté séparément, zéro sortie avant rapprochement | Exercice sur hôte vierge avec chronométrage |
| I-01 | GitHub et projets isolés | P0 | Deux dépôts, lecture paginée, doublon absorbé, omission réparée, aucune écriture distante par l'identité MVP | GitHub App de test et jeu d'événements |
| I-02 | Écritures futures | P1 | Tête de branche vérifiée et effet idempotent ou réconcilié. Approbation de PR distincte du merge et du déploiement | Identité séparée et protections réellement disponibles |
| J-01 | Portabilité de l'état | P0 | Export JSON/Markdown et manifeste d'empreintes restaurables, aucune nécessité de replay d'un fil fournisseur | Restauration d'un dossier historique et test de référence cassée |
| J-02 | Performance petite charge | P0 | 2 utilisateurs, 2 runners et sauvegarde active, lecture au p95 ≤2 s hors appels distants et aucun arrêt mémoire | Corpus et volume d'artefacts fixés avant exécution |
| K-01 | Coût prévisible | P0 | Base hôte, sauvegarde, taxes et renouvellement chiffrés. IA à 0 €, alerte si écart, aucune recharge automatique | Panier et devis officiels, dépense séparément autorisée |

Les essais défensifs n'utilisent que des données fictives ou des environnements explicitement désignés par leur propriétaire. La trace d'une recette mentionne date, cible, environnement, méthodes, tailles, résultat et éléments non vérifiés.
