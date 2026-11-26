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

Le bureau visible relit les affectations toutes les cinq secondes. Un agent disponible attend près de la banquette. Une préparation l’amène au clavier et une vérification à la table de relecture. Un poste hors ligne ou sans contact reste vide. « Mettre en pause » fige la scène. Le clavier, la réduction des animations et le lien « Actualiser » permettent aussi de consulter les états.

Dans le portefeuille, « État Git local » présente la dernière branche observée, le commit, les modifications locales et l’heure du relevé. Un clic sur la branche ouvre le dossier relié dans le Studio. « Observer le checkout » actualise le relevé. Un dépôt configuré avec une adresse distante vide utilise uniquement le chemin local autorisé, y compris pour un projet sans origine GitHub.

« Actualiser les relevés Git » relit les dépôts locaux du périmètre affiché. « Afficher les dépôts modifiés » rassemble les projets comportant des changements indexés, modifiés ou non suivis. Le graphique sur sept jours compte les événements de mission et les relevés Git enregistrés par le Studio, par jour civil à Paris.

## Données et requêtes

### Équipes documentaires et loft

Sur le Core local, `STUDIO_TEAM_PROJECTS` contient les identifiants séparés par des virgules des projets auxquels attribuer un binôme. Au démarrage, seuls les dépôts enregistrés en lecture locale et les projets hors démonstration sont retenus. Un processus supervisé par projet reçoit par canal privé deux clés temporaires limitées au Control Room de ce projet. Il s'arrête avec le Core. Les agents travaillent sur le document fourni en mémoire avec les adaptateurs locaux, sans fournisseur payant.

La fiche projet propose une passation Git ou un contrôle de propreté à partir d'un relevé daté. Actualiser le relevé pour examiner des changements plus récents. Le brouillon est modifiable. « Valider le plan » autorise l’exécution standard. Le rapport conserve l’index, les critères et la synthèse avec leurs empreintes. La liste des missions accepte aussi un document et des expressions à vérifier.

Dans le loft, le café désigne la disponibilité, le bureau une attribution active, et la table de réunion la synthèse des deux preuves. Les postes sans contact récent quittent la scène. « Rejouer les trois étapes » illustre les tentatives acceptées de la dernière mission affichable, dans leur ordre de démarrage. Le bouton indique la relecture et permet de revenir au direct.

`STUDIO_ARCHIVE_DEMOS=1` range A et B dans « Démonstrations archivées » si leur classification est encore synthétique. Leurs missions restent accessibles aux comptes déjà autorisés. Le portefeuille et le loft présentent alors les projets actifs.

Les pages lisent l’état PostgreSQL dans une transaction cohérente en lecture seule. Toutes les lectures métier filtrent les projets de l’acteur, y compris les tentatives et les événements. Seul l’administrateur peut lire la date, le résultat et la taille du dernier contrôle de sauvegarde. L’interface présente jusqu’à 24 missions prioritaires, 16 événements et les six dernières tentatives de chaque poste, ainsi que tous ses baux actifs. Les profils conservent l’historique de révision, dont les vingt dernières sont affichées.

| Adresse | Opération |
| --- | --- |
| `/workspace`, `/api/workspace` | Vue globale, filtre facultatif `project` |
| `/office`, `/api/office` | Lecture des postes et de leurs tentatives |
| `/projects/new`, `/api/projects/new` | Création réservée à l’administrateur |
| `/projects/<id>/settings`, `/api/projects/<id>/settings` | Lecture et modification du profil |

La modification reçoit la révision lue par le formulaire. En cas de conflit, rechargez et vérifiez les valeurs avant de reprendre l’édition. La répétition du même contenu conserve le numéro de révision.

## Qualification locale

Les menus, les sélecteurs et le portefeuille classent les projets par nom, en français. Dans le loft, le café accueille les agents locaux disponibles, les bureaux les tâches attribuées et la table les synthèses. Les flèches permettent de parcourir les groupes quand l’atelier accueille plusieurs équipes.

<details>
<summary>Décor et personnages du loft · fichiers et prompts ImageGen</summary>

Les deux images ont été créées avec l’outil ImageGen intégré. Le Studio sert le [décor](../src/office/atelier-paris.webp) et la [planche de personnages](../src/office/equipe-atelier.webp) depuis le disque local.

**Décor**

> Stylized concept art. Deliver one finished landscape 3:2 GAME ENVIRONMENT BACKGROUND for an original premium isometric pixel-art creative studio, empty of people, for live characters to be overlaid. Eye of an award-winning cozy game art director. Full-bleed architectural cutaway, camera fixed at 30 degrees looking down, parallel isometric projection, no UI or type. Industrial Parisian rooftop print atelier after sunset, rich plum and midnight petrol blue exteriors, amber lighting and polished honey oak inside, tall mint steel arched windows looking onto a twilit skyline with a few lit windows. Left interior cafe with gorgeous oversized brass espresso machine, shelves of ceramic cups, dark teal glazed tile counter, terracotta sofa, low round tables and potted fig, warm shaded brass lamp. Rear-right raised work area with a pair of drafting desks, widescreen monitors, pinboards with tiny abstract pastel papers, adjustable lamps, cable trays. Foreground right an oval table, leather chairs and huge warm pendant, framed by a geometric patterned rug. Room fills composition, very little empty exterior. Leave clear open traversable floor in front of café lower left and through center for pixel avatars. Harmonized selected colors, expertly clustered high-resolution pixel detail, crisp tactile furnishings, beautifully art-directed soft pools of light and long diagonal sunset shadows; charming handcrafted indie videogame screenshot, clearly readable at thumbnail. No people or silhouettes of people anywhere, no text, letters, logo, watermarks, overlays, grids, markers or borders. Entire large floor and all three zones visible in one connected room, no wall cut between zones.

**Personnages**

> A professional production-ready CHARACTER SPRITE ATLAS on a truly TRANSPARENT canvas, landscape 3:2 exactly SIX full-length separate little adult characters arranged in a perfectly aligned 3 column x 2 row grid of square cells. One whole isolated full body figure CENTERED in each cell, feet at 90% of each cell, generous transparent gutters, no overlap, no backdrop, no ground, no shadows outside feet, no type. Matching sprite designs for a beautifully hand-pixelled cozy Paris print workshop game, high craft 48-bit pixel art, clearly visible square pixel clusters, same scale and proportions for every figure, three-quarter front view, slightly elevated camera, friendly faces, heads approximately 1/4 of full height, warm amber rim light from right. Top row from left: Black woman with curly dark hair, ochre cardigan, dark high waist trousers holding a tiny mug; young light-skinned man with tousled dark hair, forest green shirt, cream trousers and brown shoes with a journal; mature brown-skinned woman with cropped silver hair, copper jacket, jeans and glasses holding folded blueprint. Bottom row from left: East Asian man with round spectacles, indigo overalls, rust shirt with a pencil; South Asian woman with burgundy long hair, sage work apron over jeans holding sketchbook; stocky bearded man with gray cap, honey turtleneck, navy pants holding a coffee cup. Warm lively natural standing poses, varied distinctive silhouettes, attention to pixel detail like a premium cozy RPG. All six are well dressed for work, no lettering of any sort, no borders. Front three-quarter facing left or right.

</details>

Les sessions Cursor apparaissent sur la fiche projet et dans Agent Office. Ouvrir une session ou sa PR demande un clic explicite. La date affichée est celle du relevé GitHub. Pour actualiser une sélection depuis un export local compatible avec les champs `number,title,url,headRefName,state,isDraft,body` de GitHub CLI, utiliser `node --env-file=.env.local scripts/import-cursor.ts projet propriétaire/dépôt fichier.json`. L’import conserve les PR de branches `cursor/` contenant un lien de session Cursor et ne stocke pas leur description. Les PR ouvertes et en brouillon sont regroupées sous « À reprendre ».

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
