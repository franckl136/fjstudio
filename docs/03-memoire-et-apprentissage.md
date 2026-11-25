# Mémoire, provenance et apprentissage

**Folk & Joy Studio · proposition de conception · 25 novembre 2026**

Le Studio possède sa mémoire métier. Il peut présenter le résultat d’une mission, reconstruire le contexte autorisé d’une étape ou relayer un apprentissage validé avec un moteur différent. La source de référence reste identifiable, et une sortie d’IA garde son statut de proposition tant qu’une preuve et une décision de validation ne l’ont pas promue.

## 1. Niveaux de mémoire

| Niveau | Contenu | Autorité et persistance |
|---|---|---|
| Travail de tentative | Cache de runner, conversation native, brouillons, sorties intermédiaires | Jetable. Peut survivre brièvement à une coupure locale. Aucune reprise métier ne dépend de ce stockage |
| Mémoire de mission | Objectif, plan, checkpoints validés, décisions, contexte, preuves et rapport | PostgreSQL et artefacts. Épinglée aux versions effectivement utilisées, visible selon le projet |
| Mémoire d’agent | Profil de compétences versionné, préférences autorisées, références aux expériences utiles | Références par agent et projet. Seules les connaissances dont le demandeur et la mission ont les droits deviennent visibles |
| Mémoire du projet | Documentation Markdown, décisions techniques, incidents, conventions, dépendances observées, leçons validées | La documentation GitHub est versionnée par commit. Les observations opérationnelles appartiennent au Studio |
| Mémoire commune du Studio | Méthodes réutilisables, modèles de mission, contrôles, pratiques d’exploitation | Publication explicite par un gestionnaire habilité. Révision de provenance et nouvelle classification avant partage |

Une connaissance d’agent est liée à son identité Studio et à un périmètre, quelle que soit la version du moteur. Un profil réutilisé entre projets ne voit que les éléments explicitement partagés. Une réponse ancienne ne devient jamais une règle durable par sa seule présence dans l’historique.

## 2. Provenance et modèle métier

Distinguer trois dimensions indépendantes. Le **type** décrit une décision, un constat, une hypothèse, une expérience ou une procédure. Le **statut éditorial** indique proposée, en revue, validée, contestée, obsolète, remplacée ou retirée. Le **périmètre d’usage** donne projet, classification, restrictions de destinataire et date de revalidation. Un constat validé sur un commit reste utile dans l’historique même lorsque ce commit n’est plus la référence courante.

| Objet | Données indispensables | Règles |
|---|---|---|
| Source versionnée | Projet, dépôt, chemin, commit, blob, section et empreinte. Pour un artefact, mission, tentative, type et empreinte | Une source peut devenir indisponible ou perdre sa visibilité. Conserver le lien de provenance et appliquer la règle de retrait au contenu |
| Connaissance versionnée | Identifiant logique, version, titre, énoncé, type, portée, validité, preuve et indicateur d’actualité | Version publiée immuable. Une mise à jour crée une version et un lien de remplacement |
| Preuve | Référence source ou artefact, plage, mode d’obtention, date et identifiant de tentative le cas échéant | Vérifier rattachement au projet et à la version. Un résumé d’une preuve demeure un dérivé |
| Événement de validation | Auteur de la décision, rôle, critères, version examinée, preuve retenue et limite | Ajouter un événement. Les consommateurs voient le dernier statut autorisé |
| Référence de mémoire d’agent | Agent, projet ou périmètre partagé, connaissance et usage recommandé | Toute lecture réévalue la portée et la visibilité de la connaissance |
| Lot de contexte | Plan et étape, sources, extraits, ordre, version des règles d’assemblage et classification. Empreintes du lot et du contenu transmis | Figer le contenu avant activation. Revalider autorisation et destinataire avant chaque appel ou remplacement de moteur |

Le modèle rejoint les notions du W3C d’entité, d’activité et de responsable. Un schéma relationnel et des références versionnées suffisent. Une ontologie supplémentaire et un graphe dédié peuvent attendre une demande d’interopérabilité observée. [Aperçu W3C PROV](https://www.w3.org/TR/prov-overview/), [PROV-O](https://www.w3.org/TR/prov-o/)

**Identité et historique.** Dédupliquer dans le même projet par empreinte de source normalisée et version. Une même leçon issue de deux preuves distinctes garde chaque provenance. Les références de dépôt sont fixes par identifiant GitHub ainsi que commit et chemin. Un index de recherche est une projection reconstructible. Une décision humaine, un contexte de mission figé et une preuve non reconstructible sont des données métier à sauvegarder.

## 3. Apprentissage à partir des missions

1. **Capturer.** À la clôture ou après incident, un humain, un contrôle ou un agent propose une leçon structurée. Elle indique événement, résultat recherché, résultat observé, cause établie ou hypothèse, preuve, domaine de validité et durée proposée. La collecte est bornée par mission.
2. **Comparer.** Chercher les entrées du même périmètre. Un doublon relie les preuves. Un désaccord ouvre une revue. Une leçon sans preuve reste proposée avec motif.
3. **Vérifier.** Un relecteur autorisé évalue source, confidentialité et reproductibilité. Le Quality Lab fournit un résultat si la leçon porte sur un comportement testable. Une proposition de règle métier requiert le rôle approprié. L’agent qui propose peut présenter ses preuves et ne peut promouvoir seul la règle.
4. **Publier.** Créer une version validée, fixer les limites d’utilisation et indexer la version visible. Une synthèse générée conserve l’identifiant de la version et les sources.
5. **Utiliser et mesurer.** Montrer quelles leçons ont été proposées, retenues ou ignorées. Une utilisation répétée prouve la pertinence possible dans un contexte. Elle ne prouve pas sa justesse générale.
6. **Réévaluer.** Version de dépendance, rupture de preuve, changement de politique, incident contraire ou échéance déclenchent une revue. Afficher le conflit et interrompre l’injection automatique pour les décisions concernées. Les anciennes missions gardent leurs références selon la rétention.

La promotion d’une leçon n’ajoute aucun droit, outil, fournisseur ou budget. Quand la proposition implique une évolution du Studio, ouvrir une décision de politique. Quand elle implique une amélioration de compétence, publier une nouvelle version de profil avant son affectation.

### Exemple théorique

Une mission observe qu’une dépendance a cassé un scénario de test sur un commit donné. Le Studio enregistre le commit, la version de la dépendance et l’échec. Le relecteur vérifie que le cas est reproductible et approuve une leçon circonscrite à cette famille de versions. Une future mission reçoit la leçon et ses preuves si sa version correspond. Une mise à jour incompatible suspend la suggestion automatique et ouvre une revalidation. Un résumé générique du problème ne devient partagé entre projets qu’après vérification et retrait des données propres au dépôt.

## 4. Recherche et assemblage du contexte

**MVP lexical.** Indexer Markdown, rapports, décisions et connaissances éligibles dans PostgreSQL avec tsvector et GIN. Pondérer titre, chemin, sections et corps. Conserver des termes exacts pour symboles, identifiants et références Git. Une extension pg_trgm peut servir pour les fautes de frappe et termes voisins si le besoin ressort de la recette. Les règles de visibilité et de classification s’appliquent à chaque requête, aux compteurs et aux extraits. [Recherche PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html), [index GIN](https://www.postgresql.org/docs/current/textsearch-indexes.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

**Sélection.** Partir des sources attachées à l’objectif, des documents requis par le profil et des références explicitement choisies par un opérateur. Parmi les références admissibles restantes, classer par pertinence, autorité et actualité. Préférer une politique de contexte lisible à un volume arbitraire. Dédupliquer les versions et sections proches. La recherche automatique doit pouvoir fournir le motif de sélection. L’opérateur peut retirer un candidat ou ajouter une source s’il en a le droit. Lorsqu’un document obligatoire dépasse la limite ou est interdit, signaler le blocage et conserver un motif précis.

**Appel.** Figer le lot approuvé, refaire les contrôles d’accès et appliquer les restrictions du destinataire juste avant départ. Produire un manifeste incluant les extraits ajoutés par le Studio, les métadonnées, les résultats d’outils que le Studio réinjecte et la troncature réelle. Pour une API directe, calculer l’empreinte du contenu au point de sérialisation, avant transport, et conserver le contenu ou les références et paramètres permettant de le reproduire selon la politique de rétention. Exclure le secret d’authentification. Après expiration ou retrait du contenu, afficher l’empreinte et l’indisponibilité de la pièce. Pour un CLI opaque, distinguer ce que le Studio a remis de ce que l’outil peut avoir chargé. Si la politique exige la totalité des entrées, seules les intégrations capables de cette inspection sont éligibles. Inspecter les tours ultérieurs lorsqu’ils ajoutent des sources. Les journaux ordinaires ne contiennent pas le texte complet des paquets.

**Données revues ou retirées.** Une révocation arrête les nouveaux usages et les téléchargements. Elle invalide les accès dérivés, y compris à un extrait ou un résultat de recherche. Si le contrôle intervient après transmission, la preuve d’envoi reste visible selon les droits d’audit. Une source modifiée produit une nouvelle version et peut invalider l’approbation du lot courant. Une purge planifiée traite contenu, extraits et vecteurs dérivés. Les exports et copies de secours suivent leur propre politique de conservation. Après restauration, contrôler les révocations et retraits connus avant réouverture de la recherche.

## 5. Comparer les stratégies de recherche

| Option | Coût et exploitation | Effet attendu et limite | Décision proposée |
|---|---|---|---|
| PostgreSQL lexical | Inclus dans la base. Index et dictionnaires à mener en exploitation | Très lisible pour noms, acronymes et références. Moins performant sur questions reformulées | Valeur par défaut. Effort sur sections, versions et provenance |
| Lexical et re-classement par règles | Calcul local faible. Pas d’appel API requis | Réduit le bruit par poids d’autorité et d’actualité. Les règles demandent une recette contre les biais de fraîcheur | Complément MVP avec bouton d’inspection |
| Hybride lexical et pgvector | Extension sous licence PostgreSQL et coût de stockage. Calcul d’embeddings local ou API explicitement autorisée | Peut améliorer les reformulations. Évaluer l’effet des filtres et les rappels si un index approximatif est envisagé | Pilote ensuite sur corpus admissible, commencer par une recherche exacte et vérifier les ACL. [pgvector](https://github.com/pgvector/pgvector) |
| Moteur ou service vectoriel à part | Exploitation et sauvegarde supplémentaires, ou contrat externe | Intérêt possible sous volume ou contraintes de latence mesurées. Copie de contenu et règles de synchronisation à traiter | Reporter jusqu’à preuve de besoin |

**Qualification proposée.** Préparer un jeu d’au moins 30 requêtes annotées mêlant termes exacts, questions reformulées, versions périmées et sources interdites. Mesurer rappel des références attendues dans les cinq premiers résultats, latence au 95e percentile, poids sur sauvegarde et nombre de résultats qui citent une source interdite. Les violations d’accès doivent rester à zéro. Proposer l’hybride seulement si son gain sur le sous-ensemble reformulé est mesurable et si la qualité des références exactes ne régresse pas. Le seuil initial de décision, à ajuster après lecture des résultats, est de 15 points de rappel supplémentaire sur les requêtes reformulées. Cette évaluation nécessite un corpus autorisé. Aucun résultat n’a été supposé.

## 6. Isolation, intégrité et rétention

- Appliquer les permissions sur le projet, la source et la classe de données. Le stockage et les relations projet empêchent un rattachement inter-projets. Tester accès directs aux extraits et citations, recherche, export et caches.
- Garder URL, chemin, métadonnées et même existence d’un résultat hors des réponses destinées à un acteur non autorisé. Un service de classement reçoit uniquement les candidats déjà filtrés.
- Traiter contenu Markdown, leçons et transcriptions comme données. Une instruction insérée dans un document ne change pas le profil d’outil.
- Préparer toute promotion vers la mémoire commune dans un canal de revue séparé. Conserver une référence minimale à la provenance d’origine sous accès restreint. Vérifier que le texte partagé ne divulgue ni identifiants ni fragments du projet.
- Conserver les preuves et lots de contexte selon leur classification et la rétention approuvée. Un rapport durable peut préserver la référence et l’empreinte d’une preuve dont le contenu a expiré. L’écran indique alors que la preuve n’est plus accessible.

## 7. Recette et arbitrages

| Scénario | Résultat attendu |
|---|---|
| Changer de moteur et reprendre une mission | Agent, provenance, plan et contexte interne consultables. Aucun transfert vers une destination interdite |
| Demander une vieille réponse IA sans preuve | Proposition affichée avec son statut. Aucune promotion automatique |
| Deux preuves contradictoires | Historique des deux sources. La suggestion automatique concernée cesse jusqu’à revue |
| Déplacer une leçon privée en mémoire commune | Revue explicite, masquage contrôlé et autorité de publication distincte. Aucun extrait inter-projet par défaut |
| Révoquer l’accès à une source après assemblage | Aucun nouvel appel avec ce contenu. Captures et preuves déjà constituées restent gérées selon la politique |
| Réindexer après restauration | Résultats reconstruits sur la bonne version. Restrictions, suppressions connues et empreintes contrôlées avant réouverture |
| Inspecter un contexte API direct puis CLI | Manifeste exact disponible pour l’API. Lacunes du CLI signalées et profil refusé si l’inspection est obligatoire |

À valider par le propriétaire. Politique de promotion des leçons, rôle de relecture, catégories de données, rétention des paquets et périmètre de mémoire commune. Le choix d’une recherche hybride attend les mesures du corpus. Le contrat d’exécution se trouve dans [Autonomie et agents](02-autonomie-et-agents.md).

**Vérification conceptuelle exécutée.** Une table de vérité locale a évalué les 128 combinaisons de sept préconditions d’envoi, avec une seule combinaison admise. Les conditions sont l’accès à la source, l’autorisation du destinataire, la politique en vigueur, la réservation si requise, le bail courant, le niveau d’inspection requis et la qualification de l’adaptateur. Le test ne vérifie ni la RLS ni un transport ou une intégration réels.
