# Échanger un dossier de mission à la main

Un opérateur ou administrateur humain peut télécharger un dossier JSON depuis une mission de la Control Room, travailler dessus avec l’outil de son choix, puis enregistrer une proposition dans Project Intelligence. Le Studio effectue l’échange dans le navigateur local. L’opérateur décide de toute transmission ultérieure, par exemple à un collaborateur ou dans sa propre session d’un outil d’IA. Le coût engagé par le Studio est de 0 €.

## Parcours dans le navigateur

1. Ouvrir le projet et sa mission dans **Agent Control Room**. Valider le plan et, pour une mission qui l’exige, l’autoriser. Les échanges sont disponibles sur une mission prête, en cours ou terminée.
2. Ouvrir **Échange manuel et propositions**. Le dossier comprend l’objectif, le périmètre, les contraintes, les expressions attendues, la révision du contrat et l’empreinte SHA-256 du document. Cocher **Inclure le texte du document** ou **Inclure le contenu des fiches validées** uniquement si leur texte est destiné à cet échange. Les deux cases sont indépendantes et vides à l’ouverture.
3. Télécharger le dossier JSON, le relire et travailler sur la proposition. Pour rendre une réponse, reprendre l’objet `responseTemplate` du dossier et renseigner `title` (1 à 140 caractères) et `content` (1 à 2 400 caractères). Conserver sa version, son identifiant d’export et son empreinte.
4. Coller cet objet seul dans **Importer une réponse**. Une fiche **Hypothèse**, d’origine **Proposition d’agent** et en état **À valider**, s’ouvre dans Project Intelligence. L’opérateur peut la valider ou la rejeter. Sa portée initiale est **Consultation uniquement** et sa confiance initiale est faible. L’auteur enregistré est le compte humain qui a importé le texte.
5. Retrouver l’état de la proposition, sa date, son auteur et l’empreinte du dossier depuis la mission. Un lecteur du projet peut consulter cet historique.

L’export de contexte reprend au plus cinq fiches retenues dans le plan. Le service vérifie que la même version reste validée et destinée aux agents de la Control Room. Si une fiche a évolué, l’opérateur peut exporter sans contexte ou ouvrir une nouvelle mission. La charge utile du dossier est limitée à 64 Kio. Les fichiers JSON comprennent le texte des seuls champs sélectionnés en plus du brief.

## Contrat local

Les chemins partent de `/api/projects/<projet>/control/<mission>/handoff` et exigent la même authentification que la Control Room.

| Requête | Entrée et résultat |
| --- | --- |
| `GET` | Historique des 50 derniers dossiers, options d’inclusion, compte importateur, empreintes et état de la proposition. |
| `POST /export` | `{commandKey,revision,includeDocument?,includeContext?}` où la clé est un UUID et les deux choix sont des booléens. Le fichier contient `dossier`, son empreinte canonique `sha256` et `responseTemplate`. Un renvoi identique avec la même clé restitue le même dossier. |
| `POST /import` | Objet complété de schéma `studio-proposal-v1`, avec `exportId`, `dossierSha256`, `title` et `content`. Retourne l’identifiant de la fiche et l’empreinte canonique de la réponse normalisée. |

Une réponse est acceptée par dossier. Un double import identique renvoie la proposition existante. Une réponse différente nécessite un nouvel export. L’import vérifie le lien au projet, à la mission et à l’empreinte du dossier, puis écrit en une seule transaction la proposition et sa trace. L’état de mission et ses checkpoints relèvent du worker et du vérificateur habituels. Les actions `handoff.exported` et `handoff.proposed` restent consultables dans l’historique de la mission. Le dossier conservé dans PostgreSQL entre dans la sauvegarde locale du Studio.

## Rejouer la recette

```powershell
$env:COMPOSE_PROJECT_NAME = 'fjstudio-product'
node --env-file=.env.local --test --test-concurrency=1 test/product-handoff.test.ts
```

La suite utilise une base temporaire, des textes synthétiques et des comptes de deux projets. Elle vérifie le consentement, les droits, la sélection des révisions, les empreintes, la concurrence, l’arbitrage par validation ou rejet et l’intégrité des checkpoints.
