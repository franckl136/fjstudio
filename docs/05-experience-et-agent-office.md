# 05 — Expérience, navigation et Agent Office

**Dossier intégral de conception · 25 novembre 2026 · Proposition soumise au propriétaire**

Le Studio est un espace privé de pilotage multi-projets. Son interface doit permettre de lire une situation, décider et vérifier l'effet de la décision depuis un ordinateur ou un mobile. Le parcours complet reste utilisable sans modèle IA. Les écrans d'exploitation du Studio et l'application Folk & Joy ont des cycles et des identités distincts.

## Parcours et navigation

Le premier parcours complet est un audit autonome dans son périmètre préautorisé. L'opérateur sélectionne le projet, le dépôt et son commit, examine le plan, le budget et le contexte, puis autorise l'exécution. Le Studio démarre les étapes prêtes, assemble les preuves et publie le rapport. La vue finale affiche les contrôles effectués, l'incertitude et les décisions à examiner. Une interruption du PC ne bloque que les étapes qui en dépendent.

```text
Studio
├── Command Center
│   ├── Vue d’ensemble / Projets
│   ├── Décisions en attente / Incidents
│   └── Santé / Dépenses / Sauvegardes
├── Projet sélectionné
│   ├── Command Center du projet / Activité GitHub
│   ├── Agent Control Room
│   │   ├── Missions / Nouvelle mission
│   │   └── Détail / Plan / Contexte / Tentatives / Livrables
│   ├── Quality Lab
│   │   ├── Rapports / Comparer deux commits
│   │   └── Référentiels / Exceptions
│   ├── Project Intelligence
│   │   ├── Recherche / Versions / Sources
│   │   └── Décisions / Connaissances à valider
│   ├── Agent Office / Détail d’une station
│   └── Paramètres projet / Membres / Dépôts / Politiques
└── Administration du Studio
    ├── Runners / Capacités / Versions
    ├── Agents / Outils / Moteurs / Fournisseurs
    └── Budgets / Journal d’audit / Notifications / Sauvegardes
```

Sur ordinateur, la navigation des cinq modules et le sélecteur de projet restent accessibles dans le cadre de page. Sur mobile, le sélecteur et le module actif restent dans l'en-tête, et un bouton « Navigation » ouvre la liste entière au clavier comme au toucher. Les pages de détail conservent un retour vers la liste filtrée. Les actions de sécurité sensibles restent dans le détail de l'objet. Les URL représentent le projet, l'objet et les filtres partageables. L'accès est réévalué à chaque chargement, y compris sur les liens profonds et les retours de navigateur.

| Module | Ce que l'écran montre | Actions et décisions | Accès et états à traiter |
|---|---|---|---|
| Command Center | Vue globale limitée aux projets accessibles. Pour chaque projet, missions actives et bloquées, contrôles récents, disponibilité runners, synchronisation et alertes. Santé VPS, base, sauvegardes et coûts en synthèse pour l'exploitant | Ouvrir la preuve ou le journal associé, reconnaître un incident autorisé, reprendre la tâche depuis son détail. Les vues enregistrées conservent les filtres | Distinguer zéro élément, service dégradé et mesure inconnue. La perte d'une source affiche la dernière observation et son âge. Un projet non accessible ne contribue ni au total ni à la recherche globale |
| Agent Control Room | Liste triable avec priorité, objectif, état et prochaine action. Détail avec plan, dépendances, version, agents, moteur, capacités, effets possibles, budget et journal | Créer une mission depuis un modèle, éditer le brouillon, soumettre, approuver la version figée, annuler, reprendre après les gardes, exporter. Navigation alternative au diagramme par liste d'étapes | Le demandeur et l'approbateur voient les actions pour lesquelles ils disposent d'un droit. Un bouton suspendu affiche sa raison. Une mutation concurrente entraîne relecture de l'état et de la version |
| Quality Lab | Commit exact, environnement, référentiel et verdict. Couverture par famille de contrôles, différences par rapport à une référence comparable, preuves et exceptions | Lire ou télécharger une preuve, relancer un contrôle éligible, ouvrir un incident, soumettre une exception motivée, comparer deux rapports comparables | Afficher séparément échec vérifié, contrôle non exécuté, preuve insuffisante et source périmée. Seul le responsable qualité habilité fait évoluer le référentiel. L'auteur du candidat ne valide pas son exception |
| Project Intelligence | Recherche filtrée, extraits, provenance par dépôt/chemin/commit et historique. Décisions, conventions et apprentissages soumis à revue | Ajouter ou retirer une source au brouillon du contexte, ouvrir la source GitHub, comparer les versions, proposer un apprentissage, le valider selon rôle | Un résultat absent peut venir d'un filtre, d'une source périmée ou d'un corpus vide. Un retrait de droit ferme le détail et supprime les extraits visibles. Le contenu privé n'est pas promu dans la mémoire partagée par défaut |
| Agent Office | Stations issues des agents autorisés, statut opérationnel, mission, horodatage, disponibilité de capacité et échanges de livrables attestés | Filtrer par mission, projet et état, ouvrir la station, revenir au journal source. Une action sensible renvoie au détail et réévalue les droits | Les projections peuvent être périmées. Les agents temporaires terminés restent dans l'historique. La lecture des états ne donne aucun droit d'approbation ni de changement de capacité |

## Contrats d'affichage et d'action

- **Fraîcheur.** Les vues indiquent l'heure de l'observation serveur en plus d'un temps relatif. Une coupure réseau suspend le rafraîchissement. Les dernières données autorisées peuvent rester visibles avec un état « Données de HH:MM · connexion interrompue ». Les actions de mutation exigent un retour serveur valide.
- **Actions asynchrones.** Après soumission d'une demande, afficher « Demande enregistrée » uniquement après accusé durable. Une annulation passe par « Annulation demandée », « Arrêt confirmé » puis « Annulée » si l'orchestrateur a aussi traité les effets. L'interface expose le dernier état qui fait autorité. Un timeout côté navigateur ne réémet pas une action sensible automatiquement.
- **Budget.** Afficher montant engagé, réservation ouverte et coût rapproché avec devises et période. Un coût inconnu est marqué comme tel. Un plafond est montré comme un montant et un motif de suspension, sans réclamer à l'utilisateur de deviner le modèle tarifaire.
- **Approbation.** Le dialogue présente projet, action, cible, commit ou empreinte de plan, conséquences, destination des données et borne de coût. Une décision en retard revient à la version courante, en conservant la précédente dans l'audit. Le focus revient à l'élément déclencheur après fermeture quand il reste présent. [Modèle de dialogue WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- **Qualité des messages.** En navigation usuelle, un badge court nomme l'état et renvoie au motif. La couleur apporte un repère. Le texte et l'icône restent disponibles. Un flux de sauvegarde ou d'approbation montre l'état en cours, l'accusé et l'erreur récupérable. [Étiquettes Primer](https://primer.style/product/components/label/), [sauvegarde dans Primer](https://primer.style/product/ui-patterns/saving/)

### Détail de mission de référence

L'en-tête reste limité à l'objectif, l'état, le projet, la référence Git et l'action suivante. Le contenu s'organise dans l'ordre suivant.

1. **Aperçu** — cause de l'état, prochaine échéance, plafonds, étapes bloquantes.
2. **Plan et approbations** — dépendances, responsabilités, versions et décisions.
3. **Contexte** — source, extrait, empreinte, destinataire et classification. Pour un moteur opaque, indiquer les portions inspectables et les données pouvant être lues via ses outils. Réserver un profil qui impose une inspection exhaustive aux seuls moteurs qualifiés pour ce niveau.
4. **Tentatives et événements** — progression réelle, effets demandés/confirmés, consommation, erreurs et reprise.
5. **Livrables** — artefacts, rapport indépendant, export et limites de rétention.

Les tâches parallèles restent lisibles avec un diagramme facultatif et une liste ordonnée. L'ordre des étapes reste stable pendant la lecture. L'interface propose d'afficher les nouveaux événements lorsque le lecteur est remonté dans l'historique. Une mise à jour ne reprend pas le focus. Une anomalie d'horodatage reste rattachée à l'événement et au délai observé, sans en déduire seule un ordre métier.

## Agent Office

**Direction visuelle proposée.** Un atelier sombre et calme, avec stations alignées, une fiche par agent et une ligne d'activité datée. Palette graphite, texte clair, accent de projet discret et symboles d'état cohérents. Des formes simples et une typographie lisible expriment la spécialité de chaque station. Aucun élément décoratif ne simule un agent en train de travailler. Une illustration statique peut donner son identité au bureau, avec une alternative textuelle si elle transmet une information. La distinction du Studio tient à sa mise en page et à son vocabulaire propres.

| Direction | Bénéfice | Coût et risque | Décision |
|---|---|---|---|
| Liste sans espace visuel | Lisibilité maximale pour historique et mobile | Identité de bureau limitée | Vue compacte et alternative accessible |
| Atelier 2D par stations | Évoque un bureau et conserve des cartes structurées, filtrables, accessibles | Maîtriser le repli mobile et la densité quand le nombre d'agents grandit | **MVP proposé** sur ordinateur, mêmes données en liste sur mobile |
| Bureau isométrique | Valorise l'identité visuelle quand son utilité est démontrée | Coût d'illustration, collisions visuelles, densité, lisibilité clavier et tactile | Extension envisageable après recette du modèle d'état |

Une station correspond à un agent permanent ou à un agent temporaire de la mission filtrée. La disposition est stable pendant l'observation. Une station présente nom, spécialité, statut, libellé de la mission autorisée, capacité active le cas échéant et dernière observation. Un lien ouvre l'activité pertinente. La vue liste et la vue stations utilisent la même projection serveur. Un signal séparé donne la santé du runner et évite de confondre présence humaine, identité d'agent et processus en cours.

| État de la station | Signal qui permet de l'afficher | Détail ou état secondaire |
|---|---|---|
| Disponible | Profil actif avec capacité éligible et aucun travail exposé en priorité | « Aucun travail attribué ». Si aucun runner compatible n'est disponible, indiquer la capacité attendue |
| En préparation | Étape de planification ou préparation effectivement démarrée | Plan ou tentative concernés |
| En exécution | Tentative attestée démarrée sous bail courant | Dernier événement, moteur, durée mesurée |
| En collaboration | Livrable structuré remis, reçu ou évalué lors d'une dépendance entre agents | Lien au livrable, aux étapes et aux acteurs autorisés. Un graphe de plan seul ne prouve pas l'échange |
| En attente d'approbation | Une décision requise bloque l'étape selon le plan actif | Action et motif autorisés |
| En erreur | Échec confirmé ou incident ouvert sur l'activité principale | Catégorie, prochain traitement et urgence |
| Mission terminée | Mise à jour finale durable pour la mission placée au premier plan | Résultat, heure et historique. Le profil permanent peut redevenir disponible |
| Déconnecté | Dernière présence du runner expirée pour une activité qui en dépend | Afficher « Dernier contact » et le dernier état métier. Une tentative incertaine reste signalée |

Une station peut afficher un état principal et une information secondaire. Quand plusieurs activités coexistent, montrer d'abord l'activité filtrée. Sans filtre, utiliser une priorité déterministe des états qui demandent attention, puis l'activité active la plus récente. Ne pas substituer « Disponible » à un blocage plus important. Les projections conservent l'origine de l'événement, sa référence et sa fraîcheur. Les lignes d'état observé et les annotations d'incident s'inspirent du fonctionnement des chronologies d'états dans les outils d'exploitation. [Chronologies d'états Grafana](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/state-timeline/)

## Accessibilité et recette de l'expérience

Cible proposée **WCAG 2.2 AA**. Prévoir contraste texte ordinaire d'au moins 4,5:1, contraste non textuel adapté aux contrôles, focus visible et jamais masqué par le cadre persistant, zoom et réorganisation du contenu à 320 px CSS, objectifs de 44 px tactiles pour les actions principales. Les tableaux réellement bidimensionnels disposent d'une vue lisible équivalente pour les parcours essentiels. Les états sont compréhensibles en monochrome. Les animations de transition respectent la préférence de réduction des mouvements. Les alertes sonores et les interactions au survol restent facultatives. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [réorganisation du contenu](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [réduction des mouvements](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

Utiliser des éléments sémantiques, un lien d'évitement, des libellés explicites et une annonce polie pour les actes demandés. Un tableau de données sans manipulation cellulaire peut rester un tableau natif. Si une grille interactive est retenue plus tard, son modèle clavier et l'ordre de lecture doivent être éprouvés. Ne pas annoncer chaque événement du flux en temps réel. Les changements prioritaires et les résultats d'actions peuvent être annoncés par lot. [Table et grille WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/table/), [grille interactive](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)

| Cas de recette | Résultat exigé |
|---|---|
| Lire un audit, examiner le contexte, approuver puis consulter le rapport à 320 px CSS | Navigation et décision réalisables sans glissement horizontal global. Même empreinte, permissions et état que sur ordinateur |
| Mission préparée au clavier seul, lecteur d'écran activé | Ordre de focus cohérent. Retour de focus après dialogue. Annonce de l'accusé et de l'erreur sans répétition du journal |
| Changement de projet ou retrait d'appartenance | Les compteurs, gardes, téléchargements et sorties de recherche sont remis à jour. Un ancien lien ne révèle pas le nom ou un extrait d'un projet devenu inaccessible |
| Coupure pendant une approbation et rechargement | L'état est relu au serveur. Aucun affichage de succès avant confirmation. Aucun envoi de mutation en arrière-plan sans décision |
| PC éteint ou événements en retard | L'Office affiche déconnexion et âge du signal avec dernier état connu. Il n'affiche ni mouvement décoratif ni progrès estimé comme activité réelle |
| Livrable échangé entre agents puis invalidé | Le journal garde l'échange attesté et le statut reflète la suite réelle. Aucun affichage d'un échange supposé à partir du plan |
| Thème sombre, zoom et réduction des mouvements | Les contrôles, badges, graphiques et descriptions restent lisibles. La couleur, l'animation et le survol ne conditionnent aucune action |
| Référence inconnue, accès insuffisant, perte de source | Copie d'erreur actionnable pour l'utilisateur autorisé et sans divulgation pour le visiteur hors projet |

Les références guident des choix de navigation, de densité et d'accessibilité. Les interactions, préférences de thème et performances restent à valider sur les navigateurs et appareils cibles.

### Palette de départ vérifiée par calcul

| Usage | Premier plan | Station | Contraste |
|---|---|---|---:|
| Texte principal | #F3F5F7 | #181C23 | 15.63:1 |
| Texte secondaire | #B1BAC7 | #181C23 | 8.72:1 |
| Accent interactif | #A9C7FF | #181C23 | 10.01:1 |
| Erreur | #FFB2B5 | #181C23 | 10.00:1 |
| Attente | #F6D58D | #181C23 | 12.06:1 |
| Focus | #85DCD5 | #181C23 | 10.73:1 |

Le calcul applique la luminance relative WCAG aux six paires proposées. Il ne couvre pas les états survolés, les superpositions, la taille de texte ou le rendu d'une interface. L'accent et le statut restent associés à un libellé. [WCAG, contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
