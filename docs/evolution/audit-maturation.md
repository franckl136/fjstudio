# Audit de départ de la maturation

Inspection du 26 novembre 2026. L’audit visuel de huit pages et ses mesures proviennent du dossier local `FjStudio-Livrables/Audit-Studio-2026-11-26`. Les constats ci-dessous décrivent la base de départ.

## Dépôt

`D:\DEV\FjStudio-Evolution`, remote `https://github.com/franckl136/fjstudio.git`. Au départ, `feat/studio-evolution` était propre, sans fichier non suivi, en version 0.4.0-rc.4, HEAD `c78a9d7`. Six commits locaux suivaient `origin/feat/studio-evolution` à `babcf35` : `4d2142c`, `2c22e41`, `bb60a69`, `9f3039f`, `5e13a4e`, `c78a9d7`. Ils portent sur le loft, la découverte des schémas, le classement des projets, le portefeuille et la navigation.

Les branches locales observées couvrent A1, G3, G3.1–G4, G5, G5.1, G5.2, la fondation produit, l’intégration de novembre et l’évolution du Studio. Les références distantes comprennent aussi main et deux branches documentaires. Aucune branche de maturation n’existait localement ni dans la réponse de GitHub. La nouvelle branche part du HEAD audité.

## Capacités et données observées

| Espace | État au départ | Élément probant et limite |
|---|---|---|
| Command Center | Fonctionnel, périmètre partiellement explicite | Trois priorités parmi sept projets. Le filtre limite les lignes du tableau. Le journal intégré garde seize événements. |
| Journal | Fonctionnel, navigation défectueuse sur une longue liste | Le serveur limite à quarante lignes. Sur 64 événements, le lien suivant était à 4 013 pixels sur un écran mobile simulé. |
| Navigation | Partiellement fonctionnelle | Le changement de projet conserve un espace, mais les liens Office globaux et le repli sur le premier projet perdent la sélection. Quinze liens partagent le même ruban mobile. |
| Missions | Exécution fonctionnelle, continuité de saisie défectueuse | Une mission du Studio exposait son verdict et trois checkpoints. Une saisie disparaissait au retour dans le projet. |
| Database Explorer | Schémas importés et métadonnées locales fonctionnels | Le schéma Supabase était extrait du code. Notion était détecté dans le manifeste de Jennifer Voyages. Aucune connexion à un espace Notion n’a été démontrée. Le catalogue interne et les connecteurs locaux explicitement autorisés ont un fonctionnement distinct. |
| Quality Lab et App Lab | Exécution locale de contrôles et rendu ; démonstrations et périmètres ambigus | Les raccourcis observés proposaient des fixtures HTML et TypeScript. Les contrôles Git et schéma ont leurs propres preuves. Un PASS sur une fixture qualifie cet exemple. |
| Project Intelligence | Fonctionnel | Propositions, décisions, révisions et import Markdown sont séparés dans le modèle. La provenance est peu visible dans la liste. |
| Studio Academy | Fonctionnel, exercices synthétiques | Carnet personnel, corrections et progression existent. Les accès contextuels et l’apprentissage du choix de projet restent perfectibles. |
| Agent Office | Fonctionnel pour les runners locaux ; présence Cursor en direct non connectée | Les deux postes locaux du projet Folk & Joy étaient disponibles. Les quinze sessions Cursor référencées relevaient de l’historique. Le rendu pixel utilise les affectations vérifiables. |

Le Studio actif répondait sur 127.0.0.1:3041. Le PostgreSQL de développement était en écoute locale sur le port 55453. Les constats de terrain viennent de la recette visuelle précédente et de la revue du code correspondant. Les essais de maturation utilisent des bases et comptes synthétiques jetables.
