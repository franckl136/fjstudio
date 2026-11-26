# Piloter un projet dans Studio

## Projet actif et espace de travail

Sur ordinateur, les liens des projets et ceux des espaces occupent deux groupes dans la barre latérale. Sur petit écran, ouvrir **Projet** pour changer de portefeuille de travail dans le même espace, ou **Espace** pour changer d’outil en gardant le projet affiché. Les deux commandes fonctionnent au clavier. **Vue globale** donne accès à tous les projets autorisés. Depuis cette vue, la Control Room, Project Intelligence et les Labs commencent par demander le projet à ouvrir.

Dans le portefeuille, **Prioritaires** filtre uniquement la liste des projets. Le libellé au-dessus des indicateurs précise leur portée, également indiquée sur le journal. Sur petit écran, chaque carte expose le projet, son état et le lien de reprise. **Détails du projet** donne accès au relevé Git, au dernier contrôle, au journal et au profil.

## Commencer sa journée

Ouvrez le Command Center et choisissez votre projet. Le nombre de postes connectés additionne les postes disponibles et occupés. Le Core considère un contact A1 récent pendant 20 secondes et un contact documentaire pendant 30 secondes. Un bail en cours justifie aussi la présence. Un poste déclaré sans contact, une session Cursor historique et une attribution passée ont chacun un libellé distinct. La scène du Loft se fonde sur le même relevé que le tableau de bord.

Dans **À examiner**, ouvrez directement la mission bloquée, la validation attendue, le dernier contrôle en échec ou le poste hors ligne. La fiche du projet indique sa description et renvoie aux relevés Git, au journal, à l’architecture et aux automatisations. La santé affichée se rapporte aux missions et au dernier passage effectivement connu.

Dans le menu Projets, les rubriques **Prioritaires**, **Suivis** et **Inactifs** regroupent les projets du compte par ordre alphabétique. Cliquez sur le titre d’une rubrique pour la replier ou la déplier. Ce choix est mémorisé dans ce navigateur.

Pour alléger votre Agent Office, ouvrez la fiche du projet puis **Modifier mon suivi**. Choisissez **Inactif (en veille)** et enregistrez. Le réglage est personnel. La vue globale du Loft masque ces projets, y compris lors du rafraîchissement en direct. **Inclure les projets inactifs** les réaffiche temporairement. Le filtre **En veille** du portefeuille permet de retrouver leur fiche et de rétablir **Suivi** ou **Prioritaire**.

## Du besoin au résultat

1. Dans **Agent Control Room**, choisissez une finalité. Les champs s’adaptent immédiatement et votre saisie reste disponible pendant que le formulaire est ouvert. Pour une maintenance, précisez le composant et la procédure de retour. Pour un test, décrivez le scénario et le résultat attendu.
2. Renseignez le document à examiner, les expressions à retrouver, la portée, la durée maximale et le besoin de validation humaine. Le texte traité reste celui du contrat. Une demande de développement prépare ici une revue de spécification.
3. Choisissez l’ordonnancement. En parallèle, les deux premières tâches peuvent être attribuées simultanément. En séquentiel, la recherche des critères attend le checkpoint de structure. Dans les deux cas, la synthèse vérifie les deux empreintes.
4. Relisez le brouillon et validez le plan. En cas d’approbation requise, ouvrez la décision dans le Command Center. Les dépendances et les attributions du plan validé sont enregistrées en PostgreSQL. La fiche permet de retrouver la tentative, le runner, la durée et le résultat.
5. Ouvrez **Agent Office** pendant le travail. Un clic sur le personnage rejoint le poste et sa mission. À la fin, les checkpoints restent accessibles sur la fiche, avec le verdict et son rapport JSON.

Le registre des agents présente les capacités de l’adaptateur d’après sa configuration et les tâches déjà remises d’après ses tentatives. Le moteur local sait indexer un texte Markdown, retrouver des critères et vérifier des preuves. Les intégrations de fournisseurs IA ne sont pas nécessaires à ces opérations.

## Du schéma à la décision

1. Dans **Database Explorer** du projet, importez une définition SQL/Prisma autorisée ou consultez une capture disponible. Choisissez l’environnement et retenez la version affichée. L’explorateur interne du Studio est réservé au compte administrateur.
2. Dans **Quality Lab → Auditer les métadonnées**, ouvrez cette source. Les constats portent sur des objets nommés, par exemple une table sans clé primaire ou une policy présente alors que la RLS est désactivée. L’examen du schéma est statique. Un test des accès en situation exige des identités et un scénario appropriés.
3. Dans **Project Intelligence**, créez une proposition. Reliez-y la preuve pendant sa révision. Une preuve de schéma pointe sur une photographie, une preuve Git sur un relevé précis et une qualification sur un rapport terminé. La validation conserve les liens de la proposition. Une modification de contenu ouvre une nouvelle révision à documenter.
4. Retrouvez ces étapes dans le **Journal du Studio**. Les filtres portent sur 1, 7, 30 ou 90 jours. Chaque événement indique son origine et ouvre son contexte. Les sources révoquées cessent d’être consultables depuis les anciennes fiches et le journal. Les contrôles globaux de sauvegarde restent réservés à l’administrateur.

## Provenance des previews et des automatisations

Depuis **App Lab**, choisissez une source explicitement disponible. Les exemples HTML et TypeScript du Studio se reconnaissent à leur libellé. Une preview porte sur l’entrée HTML autorisée au commit choisi. Le runner lui applique un conteneur sans réseau avec des limites de ressources. Les rapports comportent les observations réelles, le verdict et la capture produite. Une image de runner indisponible donne un résultat non qualifié.

Dans **Architecture du projet**, sélectionnez un passage pour relire son inventaire figé. Dans **Automatisations**, retrouvez les règles d’intervalle et de changement Git local, leur échéance et leurs observations enregistrées. Le formulaire de configuration est celui de Quality Lab. La suspension d’une règle arrête sa programmation.

## Exploitation et reprise

Le Core sert les pages et l’API sur la boucle locale. Le worker documentaire réclame les tâches sous bail. La maintenance gère migration, sauvegarde et capture du catalogue. Les six migrations ajoutent respectivement le carnet Academy (021), le catalogue Explorer (022), l’ordre des tâches (023), les liens de preuves (024), la configuration des profils Quality (025) et les champs documentaires propres à la finalité (026). Les paramètres locaux protégés restent propres à chaque instance.

Pour reproduire la recette sur l’environnement synthétique prévu, utilisez Windows, Node 24+, Docker Desktop et un PostgreSQL de test. Installez les dépendances du verrou npm, puis lancez `npm run typecheck` et `npm test`. Le test du rôle catalogue isolé nécessite les valeurs de recette précisées dans le guide Database Explorer. Les scripts navigateur créent des serveurs et des bases temporaires, puis les ferment. Le volume de recette et les preuves capturées peuvent être conservés entre campagnes.

[Exploitation et sauvegarde](../product/exploitation.md) · [Contrats de mission](../control-room.md) · [Guide Database Explorer](database-explorer.md) · [Guide des parcours Academy](../studio-academy.md) · [Architecture et automatisations](architecture-automations.md)
