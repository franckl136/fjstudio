# Plan de maturation

| Ordre | Travail | Critère de sortie |
|---|---|---|
| P0 | Comparer HEAD, audit, modules et frontières | Branche Studio dédiée, état de référence décrit dans audit-maturation.md |
| P1 | Journal, aperçu et protection des saisies | Navigation paginée dès le haut ; cinq événements maximum ; brouillon isolé repris après fermeture effective du navigateur |
| P2 | Contexte, sélecteurs mobiles et portefeuille | Trois projets parcourus à 390 × 844 et 1440 × 900 ; aucun projet implicite dans un espace exigeant un choix |
| P3 | Provenance, relations, connaissances et Academy | Nature et limites de chaque source identifiables ; navigation entre tables déclarées et exercice isolé |
| P4 | Recette, documentation et publication de branche | Contrôle TypeScript, tests PostgreSQL et Chromium, revue du contenu sortant et vérification du SHA distant |

Les tests qui créent ou modifient des données utilisent le PostgreSQL de recette sur 127.0.0.1:55453 et des bases dédiées. Le rapport de recette distingue contrôles effectués et limites. L’activation d’une version suit une décision distincte.
