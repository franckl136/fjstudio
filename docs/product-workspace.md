# Command Center et Agent Office

Ouvrez le Studio et connectez-vous avec votre compte local. Le Command Center présente les projets accordés à la session. Le sélecteur filtre missions, alertes, agents et qualifications sur un seul projet. La navigation latérale ouvre les outils du projet choisi. Depuis la vue globale, le portefeuille permet de choisir explicitement le projet à ouvrir.

## Travail quotidien

- **À examiner** relie les approbations et blocages aux missions, les propositions à Project Intelligence et les dernières qualifications en échec à leur rapport.
- **Exécution locale** réunit disponibilité du Core et de PostgreSQL, état des tâches et agents disponibles. Le dernier contrôle de sauvegarde est visible pour l’administrateur. Son heure est celle de la vérification enregistrée.
- **Profil** conserve le nom, la description, le dépôt GitHub déclaré, les branches et les critères du projet. Le dépôt et les branches servent à documenter le projet. Les sources et runners autorisés sont configurés séparément.
- **Créer un projet** ajoute le profil et le droit de l’administrateur créateur dans une même transaction. L’identifiant est définitif. Un opérateur peut éditer les profils de ses projets. Un lecteur peut consulter les profils et les révisions.
- **Agent Office** s’ouvre également quand les agents sont à l’arrêt. Cliquez sur un poste pour connaître son dernier contact, ses affectations et leurs résultats. Chaque tentative ouvre la mission correspondante et ses preuves.

## Comment lire le bureau

Un poste correspond à un triplet projet, identité de runner et rôle. Un runner déclaré peut apparaître avant son premier contact, avec la mention « Sans contact ». Un contact de moins de 30 secondes dans Control Room ou de moins de 20 secondes dans le moteur A1 indique une présence récente. Une tentative dont le bail est encore valide fait passer le poste en exécution ou en vérification. Un bail échu apparaît comme expiré dans l’historique.

Le suivi est facultatif. « Suivre les postes » relit la page toutes les 12 secondes pendant les affectations actives. Le suivi se met en pause lorsque la dernière affectation s’achève. « Actualiser » prend un nouveau relevé. La préférence système de réduction des animations est respectée.

## Données et requêtes

Les pages lisent l’état PostgreSQL dans une transaction cohérente en lecture seule. Toutes les lectures métier filtrent les projets de l’acteur, y compris les tentatives et les événements. Seul l’administrateur peut lire la date, le résultat et la taille du dernier contrôle de sauvegarde. L’interface présente jusqu’à 24 missions prioritaires, 16 événements et les six dernières tentatives de chaque poste, ainsi que tous ses baux actifs. Les profils conservent l’historique de révision, dont les vingt dernières sont affichées.

| Adresse | Opération |
| --- | --- |
| `/workspace`, `/api/workspace` | Vue globale, filtre facultatif `project` |
| `/office`, `/api/office` | Lecture des postes et de leurs tentatives |
| `/projects/new`, `/api/projects/new` | Création réservée à l’administrateur |
| `/projects/<id>/settings`, `/api/projects/<id>/settings` | Lecture et modification du profil |

La modification reçoit la révision lue par le formulaire. En cas de conflit, rechargez et vérifiez les valeurs avant de reprendre l’édition. La répétition du même contenu conserve le numéro de révision.

## Qualification locale

Les tests PostgreSQL de `test/product-workspace.test.ts` couvrent le périmètre des projets, les éditions concurrentes, les droits, les rejeux et la réalité des baux dans l’affichage.

La recette `scripts/product-workspace-browser.mjs` ouvre le vrai serveur HTTP sur un port libre en boucle locale et crée une base PostgreSQL temporaire dédiée. Elle enrôle et reconnecte trois utilisateurs synthétiques, attribue deux baux, vérifie les trois checkpoints et lance une qualification structurelle ainsi qu’une preview dans le conteneur Chromium. Elle contrôle l’affichage à 1366 × 900 et 390 × 844. Elle ferme son serveur et supprime sa seule base temporaire. Son compte-rendu JSON et quatre captures sont écrits dans un nouveau dossier temporaire affiché à la fin.

Avec le Compose du Studio produit actif, utilisez PowerShell. Le pilote playwright-core est inclus dans les dépendances de développement. Sous Windows, la recette utilise Chrome ou Edge lorsqu’il est installé. Pour un autre navigateur Chromium local, définir STUDIO_QA_BROWSER avec le chemin de son exécutable.

```powershell
$env:COMPOSE_PROJECT_NAME = "fjstudio-product"
node --env-file=.env.local --test test/product-workspace.test.ts
node --env-file=.env.local scripts/product-workspace-browser.mjs
```

La recette vérifie également qu’une fiche validée dans Project Intelligence figure dans le contrat de mission. Un lecteur consulte les deux checkpoints de chaque cas A1, le succès nominal et le verdict du contrôle négatif. Les pages historiques d’un projet, d’une mission A1 et des connaissances proposent au lecteur la consultation des preuves et la recherche.

La preview nécessite l’image Docker de Chromium épinglée par App Lab. La source `fixtures/product-lab.html` doit exister dans le commit courant du Studio. La recette ouvre aussi une revue Git et y consigne un avis synthétique. Cette étape requiert la branche autorisée. [Revue des changements](product-review.md)
