# App Lab et Quality Lab

Dans le projet actif, **App Lab** prépare la capture d’une page HTML et **Quality Lab** exécute les contrôles du profil choisi. Les deux vues partagent les mêmes passages et les mêmes preuves PostgreSQL. Un compte lecteur peut ouvrir l’historique, le détail, les captures et les comparaisons. Un opérateur du projet peut demander un passage et gérer ses règles.

## Premier passage

1. Ouvrir **App Lab** dans un projet du Studio local. Sélectionner la source `studio-sample`. Le Studio fournit sa propre page synthétique « Planning de l’atelier » dans `fixtures/product-lab.html`.
2. Laisser le commit vide pour utiliser la pointe de la référence locale au moment de la réservation. Une autre possibilité consiste à saisir les 40 caractères d’un commit accessible depuis cette référence.
3. Choisir **Préparer la preview**, puis **Actualiser** sur la fiche. Le worker local enregistre le verdict, les contrôles et une capture PNG de 960 × 600 pixels.
4. Dans **Quality Lab**, choisir un autre profil ou une autre révision de la même source. Dès que deux passages compatibles sont terminés, la comparaison montre les mesures des deux passages et l’observation la plus récente. Le premier sélecteur propose le passage précédent et le second le plus récent.
5. Pour exécuter un contrôle automatiquement, ouvrir **Configurer une règle**, choisir le profil, un intervalle de 5 minutes à 7 jours et le déclenchement. La règle « Quand le commit local change » vérifie la pointe au rythme choisi. La première vérification enregistre le commit de référence et déclenche un passage. La règle périodique peut reprendre le même commit. **Suspendre la règle** arrête les futurs déclenchements.

## Profils disponibles

| Profil | Entrée | Mesures et périmètre |
| --- | --- | --- |
| `static-html-v1` | Un document HTML | Lecture Git et SHA-256, doctype HTML5, présence de motifs script, iframe et URL externes dans la source. Ces derniers donnent une réserve. |
| `static-chromium-v1` | Un document HTML | Contrôles de la source et mesures du DOM dans Chromium. Titre document, attribut de langue, nombre de titres h1 et de régions principales. Capture réelle en PNG. Le rendu prend en compte les styles intégrés au document. Les scripts, formulaires, images et ressources externes sont bloqués. |
| `standalone-ts-v1` | Une unité TypeScript autonome | Compilateur de confiance du Studio, mode strict sans émission, environnement ES2022. Les erreurs donnent leurs codes et positions, jusqu’à douze diagnostics dans le rapport. Une référence externe ou une directive de suppression du contrôle produit `NOT QUALIFIED`. La fixture `studio-types` est définie dans `fixtures/product-lab.ts`. |

Chaque fiche indique le commit, le profil versionné, l’acteur, le déclencheur et les horaires. Le rapport inclut l’empreinte de la source et, selon le profil, l’image Docker, les empreintes du pilote et du compilateur, la version mesurée et l’empreinte de la capture. Les valeurs `PASS`, `PASS WITH RESERVATIONS`, `FAIL` et `NOT QUALIFIED` décrivent les contrôles de la fiche. Le dossier complet, le comportement JavaScript, le démarrage d’une application full-stack et ses tests npm demandent des profils supplémentaires.

## Enregistrer une source locale

Les deux sources intégrées lisent les fixtures **commitées** du Studio. Pour ajouter une source, l’administrateur définit `STUDIO_LAB_SOURCES` dans la configuration locale du service, puis redémarre le Core. Exemple pour un dépôt synthétique dédié au projet `a` et préparé par l’opérateur sur ce poste.

```dotenv
STUDIO_LAB_SOURCES='[{"project":"a","key":"atelier","directory":"D:\\Fixtures\\atelier","entry":"index.html","ref":"refs/heads/atelier"}]'
```

Le chemin désigne un dépôt Git local autonome et approuvé, avec son propre répertoire `.git`. Le service accepte une entrée UTF-8 régulière de 1 à 131 072 octets, des chemins relatifs simples et une référence locale `HEAD` ou `refs/heads/…`. Il extrait le blob Git du commit sélectionné. Les modifications de travail deviennent visibles après un commit. Le service inventorie aussi les noms de manifestes reconnus à la racine et compte les dépendances déclarées dans un `package.json` de 64 Kio au maximum. Les dossiers et références proviennent uniquement de la configuration de l’opérateur.

La réservation conserve dans PostgreSQL les octets de l’entrée approuvée, son empreinte et son inventaire. Le Studio sert la capture PNG du passage à un membre autorisé du projet. Les sauvegardes incluent l’entrée réservée et les preuves. Réserver ces sources aux données prévues pour ce projet. L’interface affiche les 100 derniers passages du projet.

## Exécution et reprise

Les images locales requises sont épinglées par contenu.

| Pilote | Image Docker |
| --- | --- |
| Chromium | `mcr.microsoft.com/playwright@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d` |
| TypeScript | `node@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530` |

Le moteur Linux Docker Desktop reçoit `--pull=never` à chaque passage. Le conteneur tourne avec l’UID 65534, un système de fichiers racine en lecture seule, une zone temporaire de 96 Mio, un CPU, 768 Mio de mémoire, un plafond de 100 processus et un délai de 30 secondes. Le navigateur lit son entrée via la boucle locale **du conteneur**. Docker désactive son réseau externe et ne publie aucun port. Le pilote envoie l’entrée sur stdin, récupère le reçu puis supprime son conteneur. Le serveur permet au plus un passage en exécution par projet et deux au total. Quatre passages en attente ou en exécution par projet et seize pour l’ensemble du Studio peuvent être réservés. À 500 passages conservés dans un projet, toute nouvelle réservation reçoit une erreur de capacité. Les preuves restent disponibles.

Une image absente, une empreinte divergente ou un dépassement de délai figure comme exécution incomplète. Une réservation en cours depuis plus de 75 secondes est clôturée au prochain cycle du worker. Après restauration, les règles sont suspendues et la file restaurée est clôturée avec un verdict `NOT QUALIFIED`. L’opérateur peut inspecter les preuves et redemander un passage.

## Contrat HTTP local

Les deux préfixes `/api/projects/<id>/quality` et `/api/projects/<id>/lab` exigent l’identité du projet. Les POST suivent les mêmes exigences d’authentification et de protection des requêtes que les autres opérations du Studio.

| Méthode et chemin relatif | Résultat |
| --- | --- |
| `GET /` | Sources, profils, historique et règles de ce projet |
| `POST /` | Corps JSON `{source,profile,commandKey,commit?}`. Un UUID de commande rend le renvoi idempotent. Réponse 202 avec l’identifiant du passage. Profils disponibles — `structure`, `visual`, `typescript`. |
| `GET /<uuid>` | Fiche et rapport dont l’empreinte a été vérifiée |
| `GET /<uuid>/capture` | PNG dont l’empreinte a été vérifiée, pour un passage avec capture |
| `GET /compare?before=<uuid>&after=<uuid>` | Deux passages du même projet, de la même source, du même fichier et de la même version de profil |
| `POST /rules` | Corps JSON `{source,profile,mode,minutes}` avec `mode` égal à `on-change`, `interval` ou `off` |

## Reproduire la recette

Avec le PostgreSQL Docker local configuré, les dépendances npm installées et les deux images présentes dans Docker Desktop, utiliser PowerShell depuis le dépôt de qualification du Studio.

```powershell
$env:COMPOSE_PROJECT_NAME = 'fjstudio-product'
npm.cmd run typecheck
node --env-file=.env.local --test --test-concurrency=1 test/product-lab.test.ts
```

La suite crée un dépôt Git synthétique temporaire et une base `fjstudio_a1_test_<UUID>`, puis les supprime en fin de recette. Elle vérifie le cloisonnement, les droits du lecteur, le rejet d’une révision inaccessible, l’idempotence, le différentiel entre deux commits, les règles de déclenchement, la reprise et les limites de file. Les deux pilotes Docker effectuent le rendu et le typage pendant cette suite. Sur ce poste, Chromium 145.0.7632.6 a produit un PNG de 22 040 octets, et TypeScript 5.9.3 a identifié l’erreur TS2322 dans la fixture incorrecte.
