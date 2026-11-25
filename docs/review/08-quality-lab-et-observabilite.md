# 08 — Quality Lab, observabilité et incidents

**Revue approfondie proposée · 25 novembre 2026 · Axes F et H**

La révision du [dossier qualité antérieur](../06-qualite-et-observabilite.md) sépare trois décisions. Un contrôle a-t-il été exécuté sur sa cible exacte ? Sa preuve atteint-elle le niveau de confiance requis ? La règle métier autorise-t-elle le passage ? De même, une commande ou un silence réseau ne prouve pas la fin d'une opération. Cette distinction doit apparaître dans les rapports et les écrans d'exploitation.

## Pipeline de qualité

1. **Préparer.** Figer le projet, le dépôt, le commit, le plan, la version de référentiel, le profil de contrôle et ses conditions. Un patch seul est conservé comme candidat exportable, avec son empreinte. Avant un verdict de passage, obtenir l'identité du candidat effectivement contrôlé. Le changement du commit, du référentiel ou des paramètres qui affectent le contrôle invalide la comparaison correspondante.
2. **Exécuter.** Le service qualité sélectionne le manifeste approuvé hors du candidat. Les outils et suites du candidat peuvent fournir des preuves supplémentaires dans une zone de confiance distincte. L'exécution d'un candidat est isolée et ne dispose pas des agents ayant choisi les règles ni des identités qui concluent sur le verdict.
3. **Attester.** L'environnement et l'identité du superviseur sont qualifiés. Les contrôles attendus sont énumérés avant l'exécution. Le manifeste de sortie relie chaque contrôle exécuté à ses résultats, données, versions et preuves. Le Studio vérifie les empreintes et les références à la tentative, au bail et à la cible.
4. **Conclure.** Le worker calcule automatiquement la décision de passage proposée à partir du référentiel et des résultats recevables. Un agent auteur ne signe ni l'inventaire ni un verdict acceptable. Une exception humaine est distincte d'une preuve. Au MVP, le résultat vit dans le Studio. Une future garde de fusion ou de déploiement nécessite démonstration par l'autorité qui décide effectivement.
5. **Reproduire.** Réexécuter le même profil sur un environnement propre à partir du commit, des versions et des entrées autorisées. Un nouveau rapport référence l'ancien. Les divergences demeurent visibles et une relance favorable ne les efface pas.

### Matrice des familles de contrôle

| Famille | Cible et contrôle indépendant | Preuve minimale et cas non vérifié |
|---|---|---|
| Unitaire | Tests de fonctions critiques et contrôle de la liste planifiée. Ajouter une suite contrôlée par le Quality Lab lorsque possible | Nombre attendu, collecté, exécuté, omis et échoué. Un code de sortie favorable sans suite identifiée n'établit pas la couverture |
| Intégration | Parcours API, règles d'état et interactions avec une base jetable. Contrats déterministes de simulateurs pour tiers | Jeu de données versionné, résultat, événements et état persistant. Comportement réel du tiers hors couverture du simulateur |
| End-to-end | Parcours complet création → attribution → preuve → rapport dans un environnement de test, puis approbation mobile et bureau | Identité de l'environnement, acteur et état final vérifié via une source indépendante de l'interface. Une capture seule ne prouve pas l'état |
| Régression | Comparer au même profil et à une référence approuvée, avec environnement, charge et version suffisants | Entrées, sortie brute, mode de comparaison et tolérance. Une différence de conditions invalide la conclusion comparative |
| Sécurité et permissions | Couvrir droits cumulés, révocation, isolation, secrets, traces et effets autorisés. Mapper les contrôles retenus à des exigences défensives d'ASVS | Autorité réelle, rôle et règle mesurée. Un périmètre inconnu ou un seul rôle administrateur ne suffit pas à conclure |
| RLS | Fixtures de deux projets, identités de service et membres réels de test. Lecture, écriture et réutilisation d'une connexion | Vérification du rôle effectif, table et opération, présence ou absence de données attendue. Vérifier les exemptions prévues et le reset du contexte |
| Migrations | Répéter sur une version précédente représentative, données de test et base jetable. Observer intégrité, durée des verrous et stratégie de reprise | Empreinte de migration, état avant/après et durée. Le succès sur base vide ne prouve pas une migration compatible avec données |
| Dépendances | Examiner le verrou, l'origine, la fraîcheur et les avis qualifiés. Distinguer impact constaté et risque à qualifier | Source et date, version évaluée, justification et dérogation. Une collecte périmée devient non vérifiée |
| Performance | Parcours et axes explicites, échantillon, concurrence, caches et ressources. Comparer la dispersion et pas seulement un temps moyen | p50, p95, taille d'échantillon et budget de régression. Déclarer une charge non comparable ou une métrique indisponible |
| Architecture | Vérifier frontières, chemins de dépendance et relations métier par règle versionnée | Liste de règles et résultats par module ou relation. Un scan incomplet ne conclut pas sur les zones absentes |
| Documentation | Vérifier références relatives, sections attendues, décisions, date de revue et concordance des engagements | Version source, référence et preuve. Le style peut être apprécié par un humain. Une conformité Markdown ne valide pas les faits |
| Exigences et livrables | Vérifier que chaque exigence obligatoire a une preuve de réception. Contrôler format, empreinte, exposition et dépendances du livrable | Matrice identifiant exigence, contrôle, sortie, décision et limite. Un résultat bien formé ne démontre pas l'exactitude de son contenu |

L'OWASP ASVS donne une base de sélection pour les contrôles applicatifs. SLSA décrit la provenance et l'identité du constructeur. Ces références aident à structurer preuves et profils. Aucune conformité ASVS complète ou niveau SLSA n'est revendiqué. Documentation consultée le 25 novembre 2026. [OWASP ASVS](https://owasp.org/projects/asvs/), [provenance SLSA](https://slsa.dev/spec/v1.2/provenance), [RLS PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Contrat de preuve et résistance aux faux positifs

| Niveau de confiance proposé | Critères | Usage |
|---|---|---|
| Déclarée | Artefact ou résultat fourni par le candidat, avec provenance et empreinte si disponibles | Triage. Pas de passage d'un contrôle obligatoire |
| Vérifiée Studio | Profil épinglé et indépendant, cible et couverture vérifiées, environnement et superviseur qualifiés, sortie reliée à un manifeste | Passage ordinaire à partir du référentiel applicable |
| Corroborée | Vérification indépendante d'une preuve importante, sur autre environnement de confiance ou autorité CI qualifiée | Contrôle critique choisi par la politique du projet |

Le manifeste doit citer le tuple **projet, dépôt, commit, plan, tentative, contrôle/version, référentiel, environnement, identité technique, artefacts et empreintes**. Il précise les entrées de test, dates, durée et couverture. Le rapport est une agrégation non modifiable de résultats et d'exceptions versionnés. Les artefacts visibles sont bornés et filtrés. Leur rétention et la perte ultérieure de preuves sont affichées. Une signature prouve l'origine sous une hypothèse de garde de clé. Elle ne prouve pas la véracité d'un calcul sur un hôte compromis.

**Contrôles de complétude.** Faire échouer le propre test du référentiel sur une fixture synthétique incorrecte et démontrer qu'un scénario nominal atteint effectivement les assertions. Comparer les contrôles attendus et exécutés par identifiant. Rejeter un résultat d'un autre commit, d'une ancienne génération ou d'une source non qualifiée. La couverture et l'environnement doivent être visibles indépendamment d'un code de sortie. Si un résultat instable bascule entre réussite et échec, conserver les deux tentatives et appliquer une règle de décision connue, avec incertitude explicite.

**Verdict.** Par contrôle, stocker résultat mesuré (succès, échec, non exécuté, preuve insuffisante, non applicable motivé) et gravité de la règle (obligatoire, avis ou information). Un non applicable ne satisfait un obligatoire que si sa condition d'applicabilité épinglée l'établit. Un échec ou manque de preuve sur un obligatoire bloque la décision. Une exception séparée peut autoriser un passage conditionnel si la politique le prévoit. Elle nomme le commit, le contrôle, le risque, le décideur et l'expiration. Les résultats négatifs restent dans le rapport. Aucun modèle n'accorde une exception.

**Modes de déclenchement.** À la demande, à échéance et par événement reçu, uniquement pour les profils autorisés. Une temporisation peut consolider des déclenchements proches en conservant les commits concernés. L'identité logique du contrôle par projet, cible et profil prévient la prolifération de copies. Une publication de statut GitHub attend une capacité distincte et qualifiée. Vérifier l'identité de l'App source, le commit et la règle qui rend le statut obligatoire. Documentation consultée le 25 novembre 2026. [GitHub Check Runs](https://docs.github.com/en/rest/checks/runs), [protection de branches GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Observabilité et limites de visibilité

| Signal | Source et rétention | Contrat |
|---|---|---|
| Événements métier | Append côté Studio, versionnés et filtrés par projet | Identifiant, version du schéma, époque, génération, horodatage serveur, origine et cause. Sert à projeter le cycle réel |
| Audit | Décisions, approbations, refus, délégations et changements de configuration | Traces d'autorité séparées des diagnostics. Conserver acteur, cible, règle, raison et résultat. Aucun contenu privé superflu |
| Logs | Émissions techniques API, worker, runner et connecteurs | JSON structuré, niveaux et catégories d'erreur. Rotation et quota. Conserver les références nécessaires à la corrélation |
| Métriques | Comptages, jauges et distributions | Attributs à cardinalité bornée. Identifiants de mission, utilisateur et requête dans les journaux et traces |
| Traces | Corrélation API → transaction → worker → runner → autorité distante, quand documentée | Identifiant généré ou filtré aux frontières. Distinguer lien causal et mesure de temps. Exclure secrets et prompts du contexte propagé |
| Santé | Signaux de processus et de dépendances, sondes internes et sonde extérieure | `live` répond sur la vie du processus, `ready` sur les ressources indispensables au service. Une sonde publique renvoie un état minimal |

Corréler par projet, mission, étape, tentative, effet et origine. Les observations du runner et les reçus distants peuvent arriver après la fin du bail. Conserver l'heure de réception et la référence d'origine sans muter une tentative devenue périmée. Le diagnostic peut exposer les règles et outils observés, le contexte inspectable, les preuves et les décisions. Les pensées internes du modèle restent hors contrat. OpenTelemetry décrit la propagation et les types de signaux. Les principes Prometheus encadrent la cardinalité et les alertes orientées symptômes. Documentation consultée le 25 novembre 2026. [OpenTelemetry, signaux](https://opentelemetry.io/docs/concepts/signals/), [propagation](https://opentelemetry.io/docs/concepts/context-propagation/), [métriques](https://opentelemetry.io/docs/concepts/signals/metrics/), [Prometheus, alertes](https://prometheus.io/docs/practices/alerting/)

### Mesures, alertes et objectifs

Les seuils ci-dessous sont des hypothèses de recette. Pour chaque règle, enregistrer mesure, durée avant ouverture, durée de stabilité avant restauration, cause de réouverture, portée, sévérité et responsable. Une source muette donne un état inconnu ou périmé.

| Périmètre | Mesure ou événement | Première réponse |
|---|---|---|
| VPS, proxy, TLS et API | Présence de la sonde extérieure, taux d'erreurs, latence p95 et échéance TLS | Après deux échecs de sonde distincts, incident de disponibilité. Comparer disponibilité publique et readiness |
| Disque et mémoire | Espace libre, croissance et pression de mémoire | Alerte à 70 % de volume, suspendre les nouvelles tâches qui ajoutent des artefacts à 85 %. Faire valider leur impact sur le VPS réel |
| PostgreSQL et worker | Connexions saturées, interruptions, transactions lentes, retour de lease | Refuser les mutations sans commit. Une fois la source saine, traiter les travaux et effets à réconcilier |
| Files et missions | Âge de la première tâche prête, échéance, motif de blocage et capacité disponible | Alerter quand une tâche éligible reste en attente malgré un créneau compatible. Séparer priorité, blocage humain et saturation |
| Agent et runner | Dernière présence, contrôle de génération, période d'inactivité, créneaux et absence de preuve d'arrêt | PC éteint attendu affiché en information. Déclencher incident si échéance critique ou arrêt incertain |
| Fournisseurs IA | Quota, erreurs par classe et profil, changement de version ou de politique | Suspendre ou router conforme à [la stratégie de failover](06-fournisseurs-et-strategie-failover.md). Une indisponibilité IA ne dégrade pas tout le Studio |
| Dépenses | Réservations ouvertes, usage mesuré, coût rapproché, divergences et plafond | Suspendre les nouvelles demandes si les bornes deviennent indémontrables. Produire une décision pour l'écart |
| GitHub et synchronisation | Livraisons acceptées et rejetées, curseur, dernière réconciliation, installation accessible | Marquer la donnée périmée. Reprendre depuis un checkpoint et rapprocher ressources. Les déclenchements exigent la fraîcheur prévue |
| Quality Lab | Contrôles requis non vérifiés, résultats instables et divergences de rapports | Bloquer le passage affecté et demander une décision ciblée. Regrouper les constats récurrents |
| Sauvegardes | Âge du dernier point utilisable, vérification et dernier test de restauration | Alerte à 18 h sans point valide. Viser RPO 24 h et RTO 4 h testés, avec horaire séparé de reprise des effets |

**Arbitrage d'exploitation.** Journaux structurés, mesures locales bornées et sonde extérieure indépendante suffisent pour la première recette. Un collecteur OpenTelemetry, Prometheus ou une interface de visualisation séparée est pertinent si les diagnostics et la rétention dépassent le socle. La sonde hors VPS est nécessaire pour détecter une perte totale. Le PC personnel ne garantit pas cette disponibilité. Choisir une voie indépendante existante ou exposer explicitement la couverture manquante. Cette voie ne reçoit aucun détail projet.

## Incidents, restauration et recette

Le cycle incident décrit ouverture, reconnaissance, stabilisation, résolution et retour d'expérience avec responsable. L'alerte technique peut se refermer après rétablissement du signal. La résolution métier exige le traitement des effets et tentatives incertains. Une notification externe est envoyée uniquement selon un canal et une règle autorisés, avec un contenu minimisé. Dédupliquer par clé incident/canal/phase, conserver les tentatives de livraison et signaler un accusé inconnu. Les journaux de production n'entrent pas automatiquement dans la mémoire partagée du Studio.

| Panne | Mesure immédiate | Vérification de reprise |
|---|---|---|
| Coupure réseau, veille ou perte PC | Rendre la capacité indisponible. Préserver la preuve locale si possible. Suspendre les tâches incompatibles avec VPS | Relire époque et bail. Prouver l'arrêt ou garder le créneau en quarantaine. Réexécuter seulement les traitements répétables |
| PostgreSQL indisponible ou VPS redémarré | Pas d'accusé métier sans commit. Sonde extérieure minimale et alerte selon fenêtre | Reprendre la projection. Réconcilier effets et baux avant d'autoriser l'attribution sensible |
| Fournisseur indisponible | Classer panne, quota ou changement de capacité. Conserver la réservation si ambiguë | Partir d'un checkpoint Studio. Nouvelle destination seulement selon politique actuelle et autorisation |
| Webhook manqué ou dupliqué | Dédupliquer et afficher la fraîcheur. En cas de perte, récupérer l'état via la réconciliation | Vérifier convergence par dépôt et ressource. Ne publier aucun verdict sur un commit différent |
| Sauvegarde échouée ou restauration | Protéger le dernier point valide. Restaurer sur hôte vierge en mode effets suspendus | Vérifier base, artefacts et accès. Réconcilier après le point restauré. Mesurer séparément service lisible et reprise des effets |

**Recette minimale.** Une preuve favorable mais inventoriant zéro test n'entraîne aucun passage. Un résultat à empreinte altérée ou d'un runner révoqué devient insuffisant. Une chaîne d'événements reproduit une mission de sa création à son verdict et associe les délais à la bonne tentative. Un VPS arrêté est détecté par une entité indépendante. Aucun événement sans autorisation inter-projet ne réapparaît en recherche, log accessible ou export. Un destinataire externe perdu ne produit pas de notification incontrôlée. Ces démonstrations sont à exécuter sur données isolées. Aucun état de production ni canal effectif n'a été testé pour ce chapitre.

Voir [la matrice des scénarios](11-scenarios-de-recette-et-tests.md) et [la conception de l'interface](09-ux-command-center-agent-office.md). Les objectifs d'exploitation, niveaux critiques et destinataires d'alertes restent soumis à validation humaine.
