# Scénarios de recette et tests

**25 novembre 2026.** Les résultats suivants sont des essais de conception réellement exécutés, puis des recettes à réaliser si le développement est autorisé. Le code de simulation est temporaire et hors publication. Aucun fournisseur, runner réel, PostgreSQL opérationnel, application ou infrastructure n'a été configuré.

## Vérifications locales exécutées

| ID | Entrée et méthode | Invariant | Résultat exact et limite |
|---|---|---|---|
| D30 | 30 étapes en chaîne dans SQLite temporaire, fermeture de connexion après 15 checkpoints. Reprise avec nouvelle génération à l'étape 16 | Aucun résultat tardif, aucune étape aval sans dépendance et aucune admission à l'horizon | 15 checkpoints retrouvés, 16 validée sur nouvelle génération, 29 validations, 30 bloquée à l'horizon. Pas de worker ou de bail distribué réel |
| BUD | Deux threads, deux connexions SQLite, demandes de 50 et 40 pour plafond 70, transaction d'admission | Au plus une admission. Un rechiffrage sans solde et une seconde émission logique sont refusés | 1 admission, 1 refus, secours de 40 refusé, même clé dédupliquée. Réservations persistantes dans le modèle. Aucun rapprochement de facture ou verrou PostgreSQL testé |
| ROUTE | Produit cartésien de sept drapeaux locaux incluant panne, quota, capacité, données, budget, effet et autorisation | Toutes les gardes doivent passer | 128 cas, 1 admis. Test de prédicat, aucune preuve qu'un adaptateur renseigne correctement les drapeaux |
| SYNC | Trois ordres distincts, un doublon, une révision manquante, comparaison à un inventaire | Un événement répété ne double pas le traitement et la réconciliation détecte un trou | Doublon absorbé, révision 2 manquante signalée. GitHub n'expose pas ce compteur global fictif. La recette réelle compare un état distant paginé |
| TEAM | Six permutations de trois candidats, une ressource par projet, détection de cycle dans un petit graphe | Un écrivain par projet/ressource, délégation cyclique et auteur-vérificateur identique refusés | Six ordres conformes dans le modèle séquentiel. Aucun verrou distant ni arbitre sémantique testé |
| REC | Combinaisons de trois états du service, époque correcte ou ancienne et trois issues externes | Admission seulement lorsqu'en service, époque courante et absence confirmée | 18 combinaisons, une admise. N'établit ni preuve d'absence réelle, ni arrêt de l'ancien émetteur, ni disponibilité |
| LATE | Historique local vidé, jeu distant contenant un effet confirmé, génération révoquée avant admission d'un nouvel envoi | Une intention absente dans le point restauré ne prouve rien. Un expéditeur encore capable d'agir bloque la relance | Contre-exemple naïf reproduit, cible déjà présente exclue après comparaison, ancienne génération et ancien expéditeur bloquants. Source simulée cohérente et instantanée |
| MEM/FAIR | Deux référentiels de version avec retrait de droit, puis 60 admissions en rotation de trois projets équipondérés | Un paquet figé ne conserve pas le droit d'envoi. Aucun des projets toujours éligibles n'est privé de tour | Un paquet sur deux admissible, 20 départs par projet et tous les projets dans chaque fenêtre de trois. Pas de concurrence, de poids, de latence ni de ressource réelle |

**Reproduire les concepts.** Créer une base jetable avec 30 lignes numérotées, état, époque et génération. Une garde refuse horloge supérieure ou égale au minimum du bail et de l'horizon. Écrire les 15 premiers résultats, fermer puis rouvrir, marquer génération 2 pour la ligne 16. Confirmer refus de 16 ancienne et de 17 prématurée. Valider 16–29, avancer l'horloge et vérifier l'état final. Pour BUD, faire s'affronter deux connexions et vérifier somme et clé unique après leur terminaison. Les modèles de prédicats se vérifient par énumération des entrées.

## Recettes proposées, à exécuter après autorisation

| ID | Montage et incident | Assertions observables | Reste non vérifié |
|---|---|---|---|
| T01 | Montage frais sans compte IA, deux projets et mission A1 nominale | Deux spécialisations, preuve indépendante, aucun appel modèle, rapport exportable et aucune fuite | Installation et parcours de bout en bout |
| T02 | Worker tué avant commit, après commit avant réveil, puis fin tardive | Dans les trois fenêtres, état retrouvé, repris sous la bonne génération, réveil durable et preuve tardive sans mutation | Atomicité pg-boss/PostgreSQL et timestamps serveur |
| T03 | Agent défaillant, candidat concurrent et objection fondée | Auteur non vérificateur, dossier objection/réponse, verrouillage au niveau de l'effet, revue du nouvel assemblage | Conflits de code et politique de priorité réels |
| T04 | Dépassement de temps, proposition de replan et deux créneaux disputés | Horizon coupe les départs, compteurs traversent les versions, projet éligible obtient son tour | Temps d'attente sous saturation soutenue |
| T05 | Panne, quota et reprise de modèle avec contexte incompatible | Motif distinct par garde, aucune transmission interdite, nouvelle tentative liée au checkpoint, réserve ancienne visible | Appels et facturation de fournisseurs réels |
| T06 | Accès retiré entre gel et envoi, document synthétique contenant texte d'instruction et marqueur de secret fictif | Paquet bloqué, outil non admis, marqueur absent de la sortie et de la télémétrie, aucun élargissement | Passerelles et isolation effectives. Test exclusivement défensif |
| T07 | Runner de test dégradé, code candidat en environnement jetable, arrêt ou mise en veille | Aucune clé ni accès hôte disponibles, preuve d'arrêt ou quarantaine, serveur refuse l'ancien jeton, tâches VPS compatibles poursuivies | OS, VM, réseau et arrêt réel |
| T08 | DB indisponible, VPS redémarré et runner PC hors ligne | Pas d'acquittement non durable, aucun nouveau budget ou effet, sonde externe alerte, reprise des lectures puis sorties autorisées | Pannes combinées et charge de récupération |
| T09 | Webhook dupliqué, tardif et perdu, accès dépôt révoqué | Aucun recul de projection, convergence après réconciliation, et état distinct « inaccessible » | GitHub App et conditions de relivraison |
| T10 | Effet réussi, reçu perdu et restauration d'un snapshot antérieur | Aucune réémission avant preuves externes et arrêt de l'ancien hôte. Journal de décision si issue inconnue | Sémantique des sources d'autorité réelles |
| T11 | Budget concurrent, timeout, début de nouvelle période, usage remonté deux fois | Plafonds sur quatre portées, retenue préservée, ajustement idempotent et écart d'imputation visible | Transactions PostgreSQL et délai fournisseur |
| T12 | Candidat modifie son test, artefact falsifié ou contrôle obligatoire manquant | Référentiel externe au candidat, seuil inchangé, preuve insuffisante bloquante et dérogation auditée si permise | Chaîne d'attestation et reproductibilité |
| T13 | Coupure d'alertes locales et copie externe inaccessible | Incident détecté par sonde hors hôte, dernière sauvegarde exploitable affichée, restauration alternative mesurée | Accès opérateur et scénario sur hôte vierge |
| T14 | PC et mobile, données d'un autre projet révoquées, événements tardifs | Navigation clavier à 320 px CSS, même motif d'attente, pas de fuite d'aperçu, activité non estimée | Navigateurs et lecteurs d'écran réels |

**Conditions de réussite.** Enregistrer versions, données, durée, résultats, hashes et écarts. Pour la résilience, mesurer l'âge du point intègre, le temps de lecture et le temps de reprise de chaque classe d'effets. Les critères P0 sont suivis dans [01](01-matrice-exigences-et-acceptation.md). Un résultat partiel doit annoncer le périmètre restant non vérifié.
