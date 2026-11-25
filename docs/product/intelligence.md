# Project Intelligence

Dans un projet, ouvrir **Project Intelligence**. Une fiche porte une origine, un auteur, une source, un type, une portée et une révision. La recherche française permet de filtrer par statut, origine, type et relation. Une proposition d’agent reste une proposition jusqu’à la décision d’un opérateur habilité. L’historique conserve les versions refusées, obsolètes ou révoquées. Les affirmations contradictoires portant sur une même clé apparaissent dans les désaccords à examiner.

## Du document au checkpoint

1. Dans le catalogue de sources, sélectionner un Markdown et l’importer. Studio lit le blob Git du commit autorisé. Le reçu donne le chemin, le blob, le SHA-256 du fichier entier et le commit. Un document trop long est identifié comme extrait.
2. Ouvrir la proposition et choisir la portée **Contexte des agents du Control Room** durant l’édition. Valider la nouvelle révision. La portée **Consultation uniquement** maintient la fiche hors des plans.
3. Planifier une revue dans Agent Control Room. L’objectif et les critères classent les fiches pertinentes du même projet. Le plan fige jusqu’à cinq révisions validées, leur texte et leur empreinte. La dernière observation Git du projet est enregistrée séparément.
4. Révoquer une fiche devenue incorrecte. Sa révocation prend effet pour les prochains plans. Une mission existante garde la version exacte utilisée pour expliquer ses résultats.

Les portées nominale, incorrecte et « les deux cas A1 » servent au parcours A1 historique. Les projets A et B disposent chacun de leur note d’exemple. Le projet A peut aussi importer l’architecture versionnée du Studio. Les documents individuels sont limités à 128 Kio dans Git, le texte de la fiche à 2 400 caractères.

## Déclarer une source

Le responsable du poste peut fournir `STUDIO_DOCUMENTS_JSON` dans la configuration privée avec une liste de sources. Chaque entrée contient `project`, `id`, `directory` (checkout local expressément autorisé), `entry` (chemin Markdown relatif) et `ref` (HEAD ou branche locale explicite). Le formulaire envoie un identifiant du catalogue. Un dépôt candidat doit être un checkout direct avec des objets locaux. Les notes du Studio peuvent utiliser son propre worktree enregistré.

L’observation Git d’un projet se configure séparément. Le service vérifie l’origine HTTPS déclarée, lit l’état local et, sur demande de l’opérateur, récupère les références dans un dépôt temporaire. Le checkout de travail conserve ses propres références et fichiers. Le serveur enregistre l’heure, le commit et le résultat de comparaison. Un réseau indisponible reste visible dans l’observation.
