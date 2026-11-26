# Agent Office

Ouvrir **Agent Office** pour retrouver les agents locaux des projets attribués à son compte. Le plan montre quatre pièces. Le nom d’une pièce ouvre sa vue détaillée. Le sélecteur de projet et **Mettre en pause** conservent le périmètre de lecture.

| Pièce | Ce que sa présence démontre |
| --- | --- |
| Bureau | L’agent prépare un livrable et dispose d’un bail actif. |
| Café | Le Studio a reçu un contact récent. Aucune tâche en cours ne lui est attribuée. |
| Salle de contrôle | Le vérificateur a pris une tâche de vérification. |
| Salle de réunion | Une tâche de synthèse est attribuée à l’agent. |

**Lire une mission.** Sélectionner un personnage à la souris, au toucher ou au clavier. Sa fiche donne son projet, son rôle, le statut observé, son dernier contact, son moteur si connu et les liens vers ses missions et résultats. Un avatar peut partager son apparence avec un autre. Le nom accessible, le projet et la fiche distinguent chaque identité. Les contacts périmés restent consultables dans **Liste des postes**. Cette liste reste accessible si le navigateur désactive JavaScript.

**Suivre un travail bref.** Quand le direct est activé dans un onglet visible, le navigateur demande un relevé des postes environ toutes les 1,4 secondes. Un changement d’affectation fait marcher le personnage jusqu’à la pièce correspondante. Si une tâche a débuté et s’est terminée entre deux relevés, « Passage récent » signale la restitution du trajet. Les compteurs indiquent l’affectation observée au dernier relevé. **Rejouer les trois étapes** permet de revoir une mission terminée et d’ouvrir ses checkpoints.

**Se repérer.** Le plan commun affiche les agents connectés des projets sélectionnés. Les quatre pièces communiquent autour d’un passage central. Le nom d’une pièce permet de zoomer sans interrompre le suivi. **Plan complet** rétablit la vue d’ensemble. Les agents qui quittent la pièce libèrent leur place. Le réglage système de réduction des animations affiche directement la destination.

## Architecture du rendu

Le serveur associe chaque poste à un triplet projet, identifiant et rôle. Les baux et contacts déterminent les affectations. Les sessions Cursor documentées par des PR restent accessibles dans leur rubrique avec la date du relevé.

Le canevas partagé mesure 760 × 412 pixels logiques. Le décor utilise le mobilier de l’atlas local et un dessin de secours si l’image est indisponible. Les personnages sont dessinés pixel par pixel à partir de leur identité. Les URL `/office?salle=cafe`, `/office?salle=bureau`, `/office?salle=controle` et `/office?salle=reunion` ouvrent les pièces. Les anciens favoris de l’atelier classique ouvrent le plan pixel.

## Qualification

- `node --test test/office-pixel.test.ts` vérifie les affectations, les identités déconnectées et la compatibilité des anciens liens.
- `node scripts/office-pixel-browser.mjs` vérifie les déplacements, les tâches brèves, le zoom, le retour au plan, les liens vers les postes et les modes sans atlas, sans JavaScript et avec réduction des mouvements. Il utilise des agents de recette et deux largeurs d’écran.
- `npm run test:browser` vérifie ces affectations avec des baux PostgreSQL et des missions réelles sur une base temporaire. Le scénario couvre aussi la relecture des trois checkpoints.

<details><summary>Fabrication de la planche de sprites</summary>

L’outil ImageGen intégré a fourni une planche unique. Les douze cellules ont été découpées selon leur canal alpha, redimensionnées et regroupées dans un WebP sans perte. Les fichiers sont servis par le Studio qui fonctionne hors ligne.

> Production sprite sheet for an original high-quality cozy isometric pixel art office game. Transparent PNG GAME ASSET ATLAS, EXACTLY 4 columns and 3 rows, 12 isolated single sprites, all equally sized square cells on a landscape 4:3 sheet, generous blank transparent margins between each cell, each sprite centered in its own cell. The camera has standard 2:1 dimetric furniture axes (horizontal axis on left side slopes DOWN LEFT, right side slopes DOWN RIGHT), seen from above. Beautiful authentic hand-placed pixel clusters, sharply defined stepped edges with espresso-brown outlines, compact 1990s building game pixel art. Warm copper, cream, honey oak, sage green, rich teal and terracotta. NO painting, NO photorealism, NO blurry edges, no real-world logos, text, letters, tile bases, ground, floor, shadows beyond object, no background, no labels, no panels, no outlines of the grid. Exact object inventory reading left to right: ROW 1: (1) a spectacular deep green fluted cafe counter with full brass espresso machine, stacks of cups and pastry dome on cream countertop; (2) cozy terracotta velvet two-seat sofa with teal cushion and splayed feet; (3) lush tall indoor monstera with split leaves in a honey woven planter; (4) a handsome oak writing desk with one desktop monitor, keyboard, little brass task lamp and tiny potted succulent. ROW 2: (1) an individual teal upholstered office swivel chair on brass casters; (2) an oval oak conference table with laptop and papers, no chairs; (3) a freestanding two-screen green and blue mission-control console with switches and keyboard, no chairs; (4) a tall bookcase with colorful books, potted trailing plant, ceramics and archives. ROW 3: FOUR full-body friendly, recognizable, professionally drawn PIXEL GAME CHARACTERS in three-quarter view, same chunky small sprite scale and head/body proportions (big heads about 1/3 of their height), all stand naturally alone looking slightly right with no ground shadows. (1) a dark-skinned woman with curly hair, mustard cardigan, dark trousers holding a mug; (2) a young man with dark tousled hair and teal shirt holding a notebook; (3) a mature silver-haired brown-skinned woman with red glasses and a wine-colored jacket holding a tablet; (4) a stocky bearded man with cap, denim work shirt and copper trousers. Entire object or full character visible in each cell with independent alpha. This is a functional sprite atlas for a game engine: only these 12 objects arranged in the prescribed positions, no extra decorations between them.

</details>
