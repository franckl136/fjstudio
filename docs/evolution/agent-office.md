# Agent Office

Ouvrir **Agent Office** pour retrouver les agents locaux des projets attribués à son compte. Le plan montre quatre pièces. Le nom d’une pièce ouvre sa vue détaillée. Le sélecteur de projet et **Mettre en pause** conservent le périmètre de lecture.

| Pièce | Ce que sa présence démontre |
| --- | --- |
| Bureau | L’agent prépare un livrable et dispose d’un bail actif. |
| Café | Le Studio a reçu un contact récent. Aucune tâche en cours ne lui est attribuée. |
| Salle de contrôle | Le vérificateur a pris une tâche de vérification. |
| Salle de réunion | Une tâche de synthèse est attribuée à l’agent. |

**Lire une mission.** Sélectionner un personnage à la souris, au toucher ou au clavier. Sa fiche donne son projet, son rôle, le statut observé, son dernier contact, son moteur si connu et les liens vers ses missions et résultats. Un avatar peut partager son apparence avec un autre. Le nom accessible, le projet et la fiche distinguent chaque identité. Les contacts périmés restent consultables dans **Liste des postes**. Cette liste reste accessible si le navigateur désactive JavaScript.

**Suivre un travail bref.** Le plan se rafraîchit toutes les cinq secondes quand l’onglet est visible et le direct activé. **Rejouer les trois étapes** montre les trois tentatives terminées d’une même mission, puis rend le direct. Un rafraîchissement peut tomber après la fin d’une tâche courte. La fiche conserve les événements qui en témoignent.

**Lire les compteurs.** L’effectif d’une pièce inclut tous ses agents dans le périmètre sélectionné. Le plan montre jusqu’à quatre personnages par pièce à la fois. Les flèches de groupe permettent de les parcourir. Les sessions Cursor référencées par les PR conservent leur rubrique séparée, avec la date de leur relevé. **Atelier classique** retrouve l’ancien rendu.

## Architecture du rendu

`/office` fournit au serveur les identités, les contacts et les attributions de l’acteur connecté. `office-scene.ts` distribue les agents aux pièces en utilisant la tâche et le rôle observés. Les pages et les filtres utilisent les mêmes contrôles d’accès que le tableau des postes. Le client reçoit des liens HTML utilisables indépendamment des décors.

Le pilote a été réalisé et vérifié sur le café. Les trois pièces suivantes réutilisent sa grille isométrique et sa palette. Le dessin local assemble les sols, les façades, les fenêtres, les luminaires, le mobilier et les personnages. Un canevas mesure 400 × 228 pixels logiques. Le navigateur adapte sa taille sans lisser ses pixels. La disposition passe de deux colonnes à une sur petit écran.

L’[atlas local](../../src/office/pixel-atlas.webp) regroupe huit meubles et quatre silhouettes sur fond transparent. Le [moteur de dessin](../../src/office/pixel-office.js) utilise une géométrie de secours quand cet atlas est indisponible. Le HTML présente les liens des postes quand le canevas est indisponible. Les meubles et les écrans dessinés sont des éléments de décor. Les effectifs et les résultats consultables proviennent du serveur. Un changement d’affectation peut déclencher une courte transition. Un agent disponible reste immobile dans le rendu pixel et le réglage système de réduction des mouvements est respecté.

Les URL `/office?salle=cafe`, `/office?salle=bureau`, `/office?salle=controle` et `/office?salle=reunion` donnent accès aux pièces. `/office?rendu=classique` restaure le décor précédent côté affichage.

## Qualification

- `node --test test/office-pixel.test.ts` vérifie le placement par tâche et rôle, le retrait des identités déconnectées et la pagination.
- `node scripts/office-pixel-browser.mjs` vérifie dans Chrome les quatre pièces, les deux tailles d’écran, l’ouverture d’une fiche, le retour au rendu classique et les secours sans atlas et sans JavaScript. Ce scénario utilise deux identités de démonstration pour les contrôles graphiques.
- `npm run test:browser` exerce le serveur et les workers de recette sur PostgreSQL. Deux baux affectent des agents de recette à deux pièces, un clic ouvre la mission correspondante et la synthèse se rejoue depuis les tentatives terminées. La base utilisée par cette commande est temporaire.

<details><summary>Fabrication de la planche de sprites</summary>

L’outil ImageGen intégré a fourni une planche unique. Les douze cellules ont été découpées selon leur canal alpha, redimensionnées et regroupées dans un WebP sans perte. Les fichiers sont servis par le Studio qui fonctionne hors ligne.

> Production sprite sheet for an original high-quality cozy isometric pixel art office game. Transparent PNG GAME ASSET ATLAS, EXACTLY 4 columns and 3 rows, 12 isolated single sprites, all equally sized square cells on a landscape 4:3 sheet, generous blank transparent margins between each cell, each sprite centered in its own cell. The camera has standard 2:1 dimetric furniture axes (horizontal axis on left side slopes DOWN LEFT, right side slopes DOWN RIGHT), seen from above. Beautiful authentic hand-placed pixel clusters, sharply defined stepped edges with espresso-brown outlines, compact 1990s building game pixel art. Warm copper, cream, honey oak, sage green, rich teal and terracotta. NO painting, NO photorealism, NO blurry edges, no real-world logos, text, letters, tile bases, ground, floor, shadows beyond object, no background, no labels, no panels, no outlines of the grid. Exact object inventory reading left to right: ROW 1: (1) a spectacular deep green fluted cafe counter with full brass espresso machine, stacks of cups and pastry dome on cream countertop; (2) cozy terracotta velvet two-seat sofa with teal cushion and splayed feet; (3) lush tall indoor monstera with split leaves in a honey woven planter; (4) a handsome oak writing desk with one desktop monitor, keyboard, little brass task lamp and tiny potted succulent. ROW 2: (1) an individual teal upholstered office swivel chair on brass casters; (2) an oval oak conference table with laptop and papers, no chairs; (3) a freestanding two-screen green and blue mission-control console with switches and keyboard, no chairs; (4) a tall bookcase with colorful books, potted trailing plant, ceramics and archives. ROW 3: FOUR full-body friendly, recognizable, professionally drawn PIXEL GAME CHARACTERS in three-quarter view, same chunky small sprite scale and head/body proportions (big heads about 1/3 of their height), all stand naturally alone looking slightly right with no ground shadows. (1) a dark-skinned woman with curly hair, mustard cardigan, dark trousers holding a mug; (2) a young man with dark tousled hair and teal shirt holding a notebook; (3) a mature silver-haired brown-skinned woman with red glasses and a wine-colored jacket holding a tablet; (4) a stocky bearded man with cap, denim work shirt and copper trousers. Entire object or full character visible in each cell with independent alpha. This is a functional sprite atlas for a game engine: only these 12 objects arranged in the prescribed positions, no extra decorations between them.

</details>
