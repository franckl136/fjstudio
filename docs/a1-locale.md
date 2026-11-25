# Tranche A1 locale · installation et qualification

La tranche met en œuvre le GO pour une exécution locale, déterministe et synthétique. L'application HTTP, le worker et PostgreSQL tournent sur la même machine. Le navigateur lance les missions et affiche les résultats conservés par le Core. Aucun compte IA, effet distant, accès de production ou hébergement externe n'est nécessaire.

## Démarrer

Prérequis : Node.js **24 ou ultérieur**, npm, Docker local et Docker Compose v2. Utiliser un moteur Docker local dont la licence convient à l'usage. La recette a utilisé PostgreSQL **17.12**. Les ports publiés sont en boucle locale. Aucun portail ou tunnel n'est nécessaire.

```sh
npm ci
npm run setup:local
npm run db:up
npm run migrate
npm run start
```

Dans un second terminal ouvert au même endroit :

```sh
npm run runner
```

Dans un terminal local, `npm run access:local` affiche la clé de connexion de l'opérateur synthétique. La saisir sur **http://127.0.0.1:3030/**. Choisir le projet A et le cas nominal. Ouvrir la mission, puis actualiser pour lire les deux checkpoints et le verdict. Sur le projet B, choisir le cas incorrect pour voir le vérificateur rejeter une estimation nulle. L'historique conserve aussi les échecs et les tentatives expirées.

Arrêter le worker et le Core avec Ctrl+C dans leurs terminaux respectifs. `npm run db:stop` arrête PostgreSQL en conservant le volume. Le fichier de configuration et le volume restent locaux.

## Configuration et initialisation

`npm run setup:local` crée `.env.local` une seule fois. Toute relance préserve la configuration existante. Les valeurs sont générées localement et ne sont jamais nécessaires au dépôt Git.

| Variable | Rôle |
|---|---|
| POSTGRES_PASSWORD | Clé de la base synthétique, utilisée par Compose lors de l'initialisation |
| A1_DB_PORT | Port PostgreSQL sur 127.0.0.1, 55432 par défaut |
| A1_PORT | Port HTTP sur 127.0.0.1, 3030 par défaut |
| DATABASE_URL | DSN de la base A1 sur 127.0.0.1, avec l'utilisateur fjstudio et sans paramètres de connexion supplémentaires |
| A1_CREDENTIALS_JSON | Identités locales et portées. Deux identités opérateur de test et quatre identités de runner distinctes |
| A1_BASE_URL | Option pour le worker, origine Core locale, sans redirection ni proxy |
| A1_RUNNER_ID | Option du superviseur pour limiter son cycle à une identité runner |

Choisir les ports avant de générer la configuration si les valeurs par défaut sont prises. Le Core n'accepte que les bases A1 autorisées par leur nom. Les outils Compose de démarrage et sauvegarde refusent un moteur Docker distant. La migration imbrique l'installation du schéma, l'enregistrement de son empreinte et les projets A et B dans une transaction PostgreSQL. La migration refuse une divergence d'empreinte sur une migration déjà appliquée.

## Architecture et reprise

| Composant | Implémentation |
|---|---|
| Core | TypeScript exécuté sur Node 24. Le Core possède l'admission, les transitions et l'autorisation projet. TypeScript, PostgreSQL et le driver pg suffisent pour cette tranche sans framework Web ni dépendance de file |
| Interface | HTML et CSS rendus côté serveur, écran projet, formulaire de lancement, détail et historique. Une session opérateur locale expire sous huit heures ou au redémarrage |
| Plan et exécution | Plan A1 versionné, deux rôles fixes. Le préparateur structure les exigences synthétiques et leurs estimations. Le vérificateur reçoit le candidat et vérifie indépendamment le schéma, la provenance, les exigences, les estimations et le total |
| Autorisations | Clés distinctes par rôle et projet. Le superviseur lance séquentiellement des sous-processus à code fixe. Chacun reçoit seulement son jeton runner et l'origine du Core. L'opérateur ne peut pas soumettre de validation runner |
| Persistance | PostgreSQL stocke mission, contexte, plan, étapes, tentatives, historique, checkpoints et preuves JSONB avec SHA-256. Les clés étrangères composites lient les preuves et tentatives au même projet |
| Attribution | La table des étapes sert de file. Le verrou transactionnel sur la mission et l'index unique partiel imposent au plus une tentative contrôlante par étape |
| Remise | Sous transaction, le Core valide identité, génération, bail et contenu de la preuve, écrit le checkpoint et libère la dépendance. Un concurrent, une remise tardive ou une seconde validation ne peut modifier le checkpoint |
| Reprise | Après une interruption avant checkpoint, l'expiration du bail rend la tâche synthétique de nouveau admissible sous une nouvelle génération. Après checkpoint, le vérificateur seul devient admissible. La lecture et les demandes de travail réconcilient les baux et horizons expirés |

Le bail nominal dure 30 s, l'horizon 15 min et chaque étape a au plus trois tentatives. Les tâches intégrées sont bornées et synchrones. Elles se terminent rapidement. Une nouvelle génération autorise uniquement la remise du nouveau résultat. L'annulation refuse des remises ultérieures et garde les preuves déjà validées. Ce statut ne constitue pas une preuve d'arrêt système d'un autre processus.

Le référentiel est maintenu dans le code du Studio, hors du candidat. Le rapport identifie sa version, ses contrôles et les empreintes. Le Core compare le résultat à la preuve déterministe attendue. La clé du préparateur ne donne aucun accès à la remise du vérificateur. Ce mécanisme sépare les pouvoirs applicatifs. Le processus Core, le superviseur, le propriétaire de la base et le compte local restent des acteurs de confiance. Les rôles n'établissent pas une isolation physique et la base ne met pas en œuvre de RLS. Les utilisateurs de l'application n'accèdent jamais à PostgreSQL directement.

## Vérifier

```sh
npm run typecheck
npm test
```

La dernière recette a réussi 16 tests sur 16, dont 10 intégrations sur PostgreSQL 17.12. La suite nécessite PostgreSQL démarré et crée une base temporaire à nom unique. Elle la détruit après les tests. Utiliser uniquement les données synthétiques de la configuration A1. Les tests contrôlent aussi les lignes persistées. Ils n'utilisent ni API IA ni source externe pour les missions.

La vérification Chromium locale a couvert la connexion, le cas nominal A, le contrôle négatif B, la consultation des checkpoints et la déconnexion, sans requête hors boucle locale. À 320 px CSS, les deux écrans de mission testés n'avaient pas de débordement horizontal. Il ne s'agit pas d'un audit complet d'accessibilité ou de compatibilité navigateur.

## Sauvegarder et restaurer

```sh
npm run backup -- backups/a1-recette.dump
npm run restore -- backups/a1-recette.dump fjstudio_a1_restore_recette
```

La sauvegarde utilise `pg_dump` en format personnalisé, via le PostgreSQL local de Compose. Elle inclut le schéma, les missions et les preuves. Le fichier est créé avec permissions restrictives lorsque l'OS les applique, sans écraser une sauvegarde existante. La sauvegarde ne contient ni fichier de configuration ni clé opérateur. Le format PostgreSQL n'est pas chiffré. Le conserver sur le poste ou sur un support local sous contrôle de l'opérateur. Une sauvegarde sur le même disque ne couvre pas la perte du poste.

La restauration utilise `pg_restore` dans une nouvelle base vierge de préfixe `fjstudio_a1_restore_`. Elle expire les anciennes tentatives actives et préserve les checkpoints et verdicts déjà validés. Restaurer uniquement une archive de confiance issue de la tranche. Une archive PostgreSQL peut contenir des objets exécutables au chargement. La restauration refuse d'écraser une base existante.

Pour utiliser la cible, arrêter l'ancien Core et ses runners. Faire pointer la DSN locale du Core vers le nom de la nouvelle base et redémarrer. Garder le fichier original ou une copie indépendante pour revenir à la source. L'essai automatisé a vérifié la reprise du vérificateur depuis une base vierge et le refus d'un ancien bail. Un second essai a restauré quatre preuves et relu un verdict dans un deuxième cluster PostgreSQL local vierge.

## Limites du périmètre

- Fixtures, exécutions de confiance et opérateurs synthétiques uniquement.
- L'accès HTTP est local. La clé opérateur et la session ne sont pas des mécanismes de production. Le TLS public, le MFA distant et l'hébergement ne sont pas configurés.
- Aucun code candidat exécutable, aucune commande transmise par l'utilisateur, aucun secret ou accès à Folk & Joy.
- Aucun fournisseur IA, accès distant, VPS, connecteur GitHub, récurrence, App Lab ni Agent Office.
- La veille, l'isolement VM de code non fiable, la reprise après perte complète du poste et la sécurité multi-utilisateur distante n'ont pas été qualifiés.
