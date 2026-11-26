# Plan de maturation

| Ordre | Travail | Critère de sortie |
|---|---|---|
| P0 | Comparer HEAD, audit, modules et frontières | Branche Studio dédiée, état de référence décrit dans audit-maturation.md |
| P1 | Journal, aperçu et protection des saisies | Navigation paginée dès le haut ; cinq événements maximum ; brouillon isolé repris après fermeture effective du navigateur |
| P2 | Contexte, sélecteurs mobiles et portefeuille | Trois projets parcourus à 390 × 844 et 1440 × 900 ; aucun projet implicite dans un espace exigeant un choix |
| P3 | Provenance, relations, connaissances et Academy | Nature et limites de chaque source identifiables ; navigation entre tables déclarées et exercice isolé |
| P4 | Recette, documentation et publication de branche | Contrôle TypeScript, tests PostgreSQL et Chromium, revue du contenu sortant et vérification du SHA distant |

## Contre-audit du 26 novembre, avant poursuite

Le cadrage ci-dessous remplace l’ordre de livraison initial ci-dessus. La confrontation porte sur AUDIT.md, mesures.json, les huit pages du PDF et le dossier captures de la version c78a9d7. Deux commits locaux existaient à la réception de l’addendum, 9b9fccb et db49e0c. La branche distante de maturation était absente. Les changements en cours sur la navigation, les Labs, l’explorateur et l’Academy ont été inventoriés avant intégration.

| Constat | État à la réception | Action prévue | Priorité | Dépendance |
|---|---|---|---|---|
| F01 | Pagination haute et aperçu court testés | Rejouer les filtres, les bornes et les liens aux deux tailles | Lot 1 | Flux complet autorisé |
| F02 | Protection couplée au brouillon local déjà développé | Livrer la garde seule par défaut. Isoler la décision de stockage et mesurer les sorties | Lot 1 | Formulaire de mission |
| F09 | Rendu partagé, détails techniques à vérifier | Libellés métier, projet, preuve et détail replié | Lot 1 | Événements et leurs sources |
| F03 | Destinations et sélecteur global en cours d’intégration | Rejouer App Lab → Office, global → Control Room, café et changement de projet | Lot 2 | Contexte et accès |
| F04 | Deux commandes mobiles, tableau adapté en cartes | Vérifier le clavier et replier les données secondaires des projets | Lot 2 | Shell et portefeuille |
| F05 | Filtre limité au tableau, libellé ajouté | Vérifier que les métriques globales conservent leur périmètre | Lot 2 | Projets prioritaires et autres |
| F06 | Libellés et révision du fichier en cours | Vérifier les deux Labs, l’historique et les surfaces qui reprennent les résultats | Lot 3 | Fixtures et fichier Git autorisé |
| F07 | Liste des missions déplacée devant la création | Mesurer le premier résultat, revenir au projet et aux checkpoints | Lot 3 | Mission synthétique terminée |
| F08 | Provenance et enrichissement relationnel déjà travaillés | Livrer la découverte et les états vides. Isoler l’approfondissement | Lot 3 | Deux projets témoins, métadonnées locales |

Les essais qui écrivent utilisent des bases jetables du PostgreSQL de recette sur 127.0.0.1:55453. La qualification sur un projet externe et l’activation de la version demandent des autorisations distinctes. Le lot suivant proposé réutilise le diagramme et le carnet Academy pour pratiquer les PK/FK avec un schéma de formation.
