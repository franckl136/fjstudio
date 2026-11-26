# Recette du contre-audit · 26 novembre 2026

**Candidate 0.4.0-rc.5, code d588527, Windows.** Comparaison avec le rapport de huit pages, les captures originales et mesures.json du 26 novembre, sur 0.4.0-rc.4 / c78a9d7. Les données du premier audit provenaient du compte connecté. Les mesures ci-dessous proviennent de jeux synthétiques utilisés sur le même PC. Le volume et les projets diffèrent.

| Constat | Référence de l’audit | Observation sur la candidate |
|---|---|---|
| F01 | 64 événements sur 30 jours, pages de 40 et 24. Début du bouton suivant à 3 155 px sur ordinateur, 4 013 px sur mobile. Accueil de 16 lignes, dont 13 Git. | 10 lignes par page. La recette intégrée a parcouru un journal de 29 événements sur trois pages. Le **bas** du bouton suivant se trouve à 507 px et 634 px. Filtres et retour navigateur conservés. Dans le jeu de classement, cinq faits au maximum et au plus un relevé Git. |
| F02 | L’objectif disparaissait au changement de projet. | La garde par défaut a fonctionné avec IndexedDB bloqué. Valeurs intactes ou rétablies, sortie directe. Après modification, « Rester » conserve les valeurs, l’abandon autorise la sortie. Vérifié sur projet, espace, page et échec d’envoi. |
| F03 | App Lab → Office perdait le projet. Le global → Control Room sélectionnait le premier projet alphabétique. | Choix explicite depuis le global. Trois projets synthétiques parcourus dans sept espaces à chaque largeur. Office, café, Control Room et guides conservent le contexte. Une ressource hors périmètre renvoie 404. |
| F04 | Ruban de 2 378 px pour 375 px visibles, 15 liens. Tableau de 440 px pour 310 px disponibles. | À 390 × 844, les deux commandes Projet et Espace répondent à Entrée et Tab. Largeur contenu/conteneur de 390/390 px pour la navigation et 324/324 px pour le tableau. La carte ouvre ses informations secondaires au clavier. |
| F05 | Trois projets prioritaires affichés mais journal et métriques plus larges. | Dans le jeu d’un administrateur, Prioritaires ramène le tableau à un seul projet. Valeurs des compteurs, portée annoncée et lien du journal global identiques avant et après. Le choix de suivi demeure personnel au compte. |
| F06 | Sur Jennifer Voyages, les sélecteurs proposaient les exemples du Studio. | Sur un projet témoin avec ces mêmes options, les deux Labs annoncent démonstration, fichier, projet, profil, environnement et commit avant soumission. Le résumé change avec le profil TypeScript. Un autre essai sur dépôt Git jetable fait avancer la branche entre lecture et soumission et retrouve le SHA affiché dans le résultat. |
| F07 | La section des missions commençait à 1 349 px sur ordinateur. | Début de section à 244 px sur ordinateur et 363 px sur mobile. Première mission à 302/412 px, statut à 324/434 px, création à 411/512 px. Une mission terminée possède trois checkpoints. Le parcours A1 nominal et le rejet de la fixture incorrecte passent. |
| F08 | Supabase disposait de structures locales. Notion était déclaré, sans photographie SQL. | Les dépôts témoins reproduisent ces deux situations. Vérifiés aux deux tailles, puis fichier illisible, dossier indisponible, import, catalogue interne et exclusions. L’essai d’introspection PostgreSQL utilise un rôle dédié sur le serveur de recette. |
| F09 | Le journal mettait en avant des identifiants tels que git_observed. | Les deux vues partagent le rendu action + projet. L’auteur, la branche, l’identifiant et le SHA complet apparaissent au dépliage. L’ouverture de la preuve Git a répondu 200 sur le relevé attendu aux deux formats. |

## Exécution

La copie candidate est située dans D:\DEV\FjStudio-Maturation. Les scripts ont utilisé la configuration locale protégée du Studio de développement, transmise au processus, et des bases jetables sur 127.0.0.1:55453. La composition Docker était fjstudio-evolution. La recette de rôle a été activée par STUDIO_EXPLORER_TEST_ROLE=1.

| Commande ou script | Résultat observé |
|---|---|
| npm run typecheck | Réussi |
| npm test | 108 réussis, zéro échec, zéro ignoré. Durée 95,1 s. |
| npm run test:browser | Réussi, Chromium 158.0.8127.89, 32,9 s. Administrateur, opérateur et lecteur de recette. Consultation autorisée, refus d’écriture du lecteur, isolation des projets. |
| scripts/drafts-browser.mjs | Garde seule puis persistance facultative. Arrêt complet de Chromium et réouverture avec le même profil, projets et comptes différents, révision, abandon, concurrence, échec d’écriture. Aucune mission créée par la seule sauvegarde locale. |
| scripts/explorer-discovery-browser.mjs | Sept scénarios de découverte/provenance réussis sur sources synthétiques. |
| scripts/office-pixel-browser.mjs | Rendu du plateau, 18 postes synthétiques sur l’essai large, mouvement, tâche brève, zoom, réduction des animations et secours sans JavaScript ou sans atlas. Essai spécialisé aux largeurs 1366 et 390 ; l’Office a également été ouvert à 1440 × 900 dans la recette intégrée. |

Le profil visuel du Lab a également produit un PNG 960 × 600 dans son conteneur local. Les tests du compilateur comprennent un PASS, un échec attendu et des contrôles incomplets. Chaque résultat appartient au fichier et au profil indiqués.

## Limites et preuves

Les parcours ont été automatisés avec trois rôles de recette. Le format mobile est émulé. Un téléphone physique, un entretien utilisateur, un lecteur d’écran, une mesure de charge et des comptes de production restent à tester séparément. Aucune qualification d’une application externe ou d’un compte Notion réel. L’audit original est conservé dans FjStudio-Livrables/Audit-Studio-2026-11-26. Le dossier compagnon Contre-audit-Studio-2026-11-26-rc5 rassemble les captures de recette sélectionnées et les mesures.

Aucune migration SQL supplémentaire entre c78a9d7 et la candidate. Les 27 migrations existantes ont été appliquées à des bases de test vierges. La garde de sortie ne requiert aucun stockage. Le magasin IndexedDB des brouillons est initialisé uniquement dans le mode facultatif décrit dans le guide des saisies.
