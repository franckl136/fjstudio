# Utiliser Studio Academy

Ouvrez **Studio Academy** dans la navigation, ou le guide contextuel depuis un module. La page rassemble dix-neuf leçons en quatre parcours. **Commencer** ouvre la première leçon. **Continuer** propose une leçon commencée dont les prérequis sont disponibles, ou le prochain exercice accessible.

## Se former

Chaque leçon relie un exemple synthétique à une action du Studio. Les liens **Observer**, **Pratiquer** et **Relire la preuve** placent le focus sur la partie correspondante de la page. Le lien vers le module ouvre un écran de consultation soumis à vos droits habituels. La navigation reste libre pendant la formation.

Un compte opérateur ou administrateur peut commencer un exercice, choisir une action et examiner le retour. Après validation, le carnet garde le résultat et sa date. En cas de réponse incorrecte, l’exercice reste ouvert. Quittez la leçon puis rouvrez-la pour reprendre. Un lecteur peut consulter les leçons, les exemples et la documentation.

La compétence affichée correspond à la réussite du cas pédagogique. Les guides sur les runners, GitHub, la sauvegarde ou la preview portent sur l’interprétation d’un cas fourni. Ils indiquent où effectuer ces opérations dans le produit.

## Carnet de mission synthétique

Six exercices suivent le même dossier personnel. Choisissez le nom prédéfini d’un atelier, sélectionnez l’objectif du brief et son critère, affectez les deux agents de formation puis exécutez les tâches documentaires. Le projet et la mission possèdent chacun leur identifiant personnel. **Mon atelier synthétique** affiche le brouillon, le plan validé, l’exécution ou la fin de la mission ainsi que l’état de chaque tâche. Les trois adaptateurs du Control Room calculent l’index, les lignes répondant au critère et la synthèse. L’exercice de preuve demande de retrouver l’empreinte SHA-256 du résultat enregistré. Cette exécution en mémoire ne réserve aucun runner.

L’exercice Quality Lab exécute la préparation et la grille A1 sur une fixture incorrecte embarquée. Le rapport conservé explique le contrôle négatif. Les quatre exercices SQL utilisent l’importateur PostgreSQL de Database Explorer en mémoire. Deux révisions synthétiques déclarent une clé étrangère et une policy SELECT. Le moteur analyse les métadonnées sans exécuter le texte SQL. Aucun exercice n’ouvre de connexion à un projet ou n’inscrit de projet dans le portefeuille.

## Aide documentaire

La recherche porte sur les titres, situations et objectifs des leçons et sur des paragraphes de guides du dépôt. Elle accepte plusieurs mots, indépendamment des accents et de la casse. Les résultats mènent au texte source consultable dans le Studio. Le moteur fonctionne localement, sans fournisseur IA ni requête réseau.

## Reprise technique

La migration `021-academy.sql` crée `academy_notebooks` et `academy_progress`. La clé personnelle distingue les comptes humains et les identités opérateur locales. La progression est lue à partir de l’identité authentifiée par le serveur. Les données de formation sont conservées dans les deux tables Academy. La sauvegarde PostgreSQL complète du Studio les inclut.

`GET /api/academy` fournit le sommaire, la progression et la prochaine leçon. `GET /api/academy/<leçon>` fournit l’exercice du compte courant. Les commandes `POST /api/academy/<leçon>/start` avec `{}` et `POST /api/academy/<leçon>/check` avec `{"answer":"…"}` exigent les droits d’écriture applicables à l’acteur. Une réponse incorrecte renvoie 422. Une étape pratique lancée avant ses prérequis renvoie 409 lors de la validation. Une validation et l’écriture de sa preuve s’effectuent dans la même transaction.

Le contrôle PostgreSQL dédié se lance avec `node --env-file=.env.local --test test/academy.test.ts` sur le service de recette isolé. La recette navigateur utilise `scripts/academy-browser-check.mjs` depuis le scénario général. Elle contrôle la réponse incorrecte, le rechargement, une étape pratique, l’accès lecteur et le rendu sur écran étroit.
