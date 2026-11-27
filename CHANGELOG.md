# Historique du Studio

## En développement · Agent Office 2.0

- Le plan distingue les postes en mission, les signaux récents de Codex, les sessions historiques et les présences inconnues. Les fiches relient agent, projet, mission, journal et preuves.
- La caméra, les places inspectables et les déplacements sur des chemins franchissables permettent de suivre un personnage entre quatre pièces. Le mode Ambiance fait évoluer quatre figurants locaux.
- Le [guide du loft](docs/agent-office/08-guide-utilisateur.md) et la [recette illustrée](docs/agent-office/07-recette.md) accompagnent la branche de développement.

## 0.4.0-rc.5 · Candidate de développement · 26 novembre 2026

- Cinq faits marquants au plus sur l’accueil. Le journal détaillé conserve les preuves, affiche dix lignes par page, les filtres et les commandes de navigation en tête.
- La Control Room présente d’abord les missions et leur statut. La garde de sortie conserve la saisie si l’on reste et fonctionne sans stockage. La persistance chiffrée sur le même appareil reste une option de recette désactivée par défaut.
- Les changements d’espace conservent le projet explicite. Le portefeuille mobile propose deux sélecteurs et des détails de projet repliables. Le filtre Prioritaires précise son périmètre.
- Les Labs affichent la nature du fichier, le commit sélectionné et les contrôles. Database Explorer adapte ses explications aux manifestes, schémas et erreurs de lecture du projet. Project Intelligence détaille la provenance et la révision de ses fiches.
- L’Academy existante conserve le contexte du projet vers les guides. Le Loft conserve la scène et distingue l’historique des missions de la présence des postes.

## 0.4.0-rc.4 · 26 novembre 2026

- Le menu Projets conserve l’espace ouvert. Depuis une mission ou une photographie, il ouvre la collection correspondante du projet choisi. La fiche reste accessible directement.
- Le Command Center réunit les priorités du compte. Chaque fiche permet de régler le suivi, de noter la prochaine action et de préparer une recette à partir des manifestes locaux.
- Le loft affiche quatre décors isométriques illustrés et conserve sa caméra au changement de projet.
- Les relevés Git reconnaissent les dossiers de travail liés au dépôt du Studio.

## 0.4.0-rc.3 · 26 novembre 2026

- Database Explorer repère les définitions SQL, Supabase et Prisma dans les dossiers reliés. Un relevé automatique actualise les versions et le tableau des projets donne accès aux diagrammes.
- Le Loft distingue les silhouettes par leurs vêtements, coiffures et accessoires dans la vue commune.


## 0.4.0-rc.2 · 26 novembre 2026

- Le Loft réunit les quatre pièces sur un plateau pixel. Les personnages traversent les portes selon les affectations reçues. Les passages brefs sont identifiés et le zoom conserve le suivi.
- Dans Agent Control Room, choisir une finalité adapte les champs en conservant la saisie. La recherche des guides et le filtre des dépôts se trouvent en haut de leurs espaces.

## 0.4.0-rc.1 · 26 novembre 2026 · candidate de développement Studio

- Le Command Center relie les alertes à leurs missions et partage le calcul de présence avec le Loft. Le journal permet de filtrer par projet, période et type d’événement.
- Studio Academy conserve les réponses, les exercices et leur progression dans un carnet personnel. Les guides contextuels accompagnent les écrans du Studio.
- Database Explorer photographie le catalogue PostgreSQL interne et les sources de projet explicitement autorisées. Les imports SQL, migrations et Prisma alimentent les fiches, la vue RLS, le diagramme relationnel et la comparaison de versions.
- Le Control Room accepte huit finalités documentaires et deux ordonnancements. Chaque étape du graphe expose ses attributions, ses dépendances et les preuves produites.
- Une révision de connaissance peut référencer une observation Git précise, une qualification ou une version de schéma. Quality Lab lit les métadonnées des versions accessibles et consigne la couverture des preuves pour six profils de qualification.
- Le Loft isométrique répartit les agents entre quatre pièces à partir de leurs contacts et de leurs tâches. App Lab distingue les exemples du Studio des sources autorisées du projet et associe ses captures à un commit.
- Les fiches Architecture et Automatisations relient la configuration déclarée, les inventaires figés, les règles du worker et leurs résultats. Les migrations 021 à 026 complètent le schéma de développement.

[Recette Windows et état des modules](docs/evolution/rapport-final.md)

## 0.3.0-rc.1 · 26 novembre 2026 · candidate de recette locale

- Accueil multi-projets, révision de profil, comptes administrateur, opérateur et lecteur avec mot de passe et TOTP.
- Graphe documentaire à trois adaptateurs spécialisés, baux et quotas, approbations, checkpoints, import de sources Git et partage de révisions explicitement autorisées.
- Bureau des agents fondé sur les tentatives observées. Revue humaine d’un commit de la branche Studio, extraits bornés et approbations datées.
- Échange local de dossiers de mission et import des réponses comme propositions de connaissance, avec consentement sur les données et contrôle d’intégrité.
- Comparaison et programmation de qualifications par projet, rendu HTML dans Chromium isolé, contrôle TypeScript autonome et campagne complète du Studio rattachée à un commit propre.
- Archives privées sur Windows, vérification quotidienne et hebdomadaire, sauvegarde avant migration et restauration en quarantaine. Les versions et archives historiques du Studio conservent leur traçabilité.
- Coffre portable pour transporter la paire dump/manifeste avec une clé d’archive indépendante, vérifier son intégrité et l’extraire dans un nouveau dossier.

## 0.2.0-rc.1 · 25 novembre 2026 · candidate interne

Le Studio ajoute une campagne hors connexion reproductible pour Courses. Les scénarios relient les fautes injectées aux opérations, aux reçus SQL et à l’état visible après fermeture complète. Les preuves sont attachées au SHA mobile et vérifiées par empreinte. L’inventaire matériel et le verdict sur téléphone restent distincts de Chromium et PostgreSQL.

La candidate ajoute des outils et un dossier de qualification. Elle ne requiert aucune migration du Studio en service. Les migrations de Courses s’exécutent dans un PostgreSQL de test. Les historiques locaux G5 et G5.1 sont conservés. [Programme](docs/g5.2-programme.md) · [Références mobiles](docs/g5.2-isolation.md)

Le Studio utilise SemVer. Une nouvelle campagne outillée ou fonctionnalité compatible relève de MINOR, une correction compatible de PATCH, une rupture de MAJOR. Le suffixe rc identifie un candidat interne. La publication d’une release et l’activation du Studio sont des opérations distinctes.

## 0.1.0 · référence antérieure

Le dépôt public proposait le noyau A1. L’installation locale a poursuivi G5 et la qualification G5.1. Le dossier de campagne G5.2 documente la correspondance entre ces historiques.
