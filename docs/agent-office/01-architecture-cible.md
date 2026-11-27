# Architecture du Loft

## Parcours de lecture

Le navigateur ouvre `GET /office?project=…`. La route vérifie le périmètre du compte et applique les préférences de suivi. PostgreSQL fournit les postes, les projets, les tentatives et le relevé des PR. Le fragment `loft=1` emploie la même projection que le rendu initial. Le retour de lecture complète permet aussi de mettre à jour les détails extérieurs à la scène.

| Composant | Responsabilité |
| --- | --- |
| `product-workspace.ts` | Regroupe contacts, baux et tentatives par projet, runner et rôle. La fraîcheur du contact reste indépendante du bail. |
| `codex-office.ts` | Lecture facultative sur le PC du Studio pour le compte administrateur. Associe le dossier exact d’un dépôt autorisé au répertoire de travail de la session. |
| `cursor-sessions.ts` | Restitue les liens de sessions et les états de PR déjà importés pour le projet autorisé. |
| `office-population.ts` | Calcule les identités, les états, les pièces et les indicateurs à partir des observations. |
| `office-scene.ts` | Produit le plan, les liens, les descriptions et les fiches utilisables au clavier. |
| `office/live.js` | Réconcilie les mises à jour par identité. Conserve la sélection et le focus ou rend le focus à l’annuaire si l’entrée disparaît. |
| `office/pixel-office.js` et sa feuille de style | Dessinent le plateau et les postures, déplacent les sprites et pilotent la caméra. La simulation vit dans une couche locale indépendante. |

## Choix du rendu

Le mobilier est dessiné une fois sur le canevas, puis lors des changements qui touchent son aspect. Un petit canevas par acteur permet de varier les apparences. L’enveloppe HTML du personnage porte le lien et le libellé accessibles. Cette combinaison préserve le plan interactif existant, permet de déplacer un personnage sans repeindre toute la scène et évite une dépendance graphique supplémentaire.

## Sources externes et limites de mesure

Le lecteur Codex ouvre SQLite en lecture seule et lit une queue bornée à 128 Kio par journal, sous le répertoire de sessions canonique. Les signaux reconnus fournissent une heure d’observation. La fraîcheur est recalculée même si le fichier reste identique. Un élément de télémétrie seul ne réactive pas un tour terminé. La fenêtre de 24 heures et la limite de 32 sessions par dossier bornent la consultation. Un index indisponible est signalé dans l’en-tête pour les comptes ayant le lecteur activé. Les journaux manquants ou sans marqueur exploitable donnent un état inconnu. Les sessions dans un autre worktree du même dépôt ne sont pas agrégées.

Le relevé Cursor est daté et regroupe plusieurs PR portant le même identifiant dans un projet. Aucune requête vers une API Cursor ne participe au rafraîchissement. Les sessions clôturées et les observations insuffisantes restent consultables dans les fiches.

La simulation utilise exclusivement les objets du navigateur. Les routes d’écriture, les workers, les contrats de l’API JSON et les migrations sont hors du chemin de rendu.
