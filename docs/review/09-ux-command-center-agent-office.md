# 09 — Command Center, Agent Control Room et Agent Office

**Revue approfondie proposée · 25 novembre 2026 · Axe E**

Le [dossier d'expérience](../05-experience-et-agent-office.md) fixe les cinq modules, une vue Office par stations et un comportement accessible. Cette révision précise la hiérarchie des écrans, la distinction entre ordre donné et travail confirmé et les projections qui donnent leur contenu aux stations. Les wireframes décrivent des écrans fictifs avec des données de recette. Ils n'engagent aucun composant applicatif.

## Principes et organisation des écrans

Desktop en priorité pour les files, comparaisons et vues parallèles. Mobile pour repérer un blocage, examiner une preuve, valider une action autorisée et consulter ses suites. Le cadre persistant porte projet sélectionné, navigation des modules, recherche et décisions en attente. Le sélecteur de projet actualise toutes les projections et ferme les détails qui n'appartiennent pas à la nouvelle portée. Les URL et filtres sauvegardés sont des préférences. Le serveur autorise à nouveau la lecture quand un lien est ouvert.

| Interface | Informations nécessaires | Actions et garde |
|---|---|---|
| Command Center | Projets visibles, missions par priorité et état, prochaine intervention humaine, activité runner et agent, incidents, qualité par commit, GitHub, plafonds, sauvegardes et santé | Passer du nombre à la liste filtrée et du motif à la preuve, ouvrir une décision en attente, reconnaître un incident avec droit. Les totaux sont limités au périmètre lisible |
| Agent Control Room | Plan et version, étapes et dépendances, délégations, checkpoints, contexte, coût estimé/réservé/rapproché, états et suites | Créer et éditer un brouillon, soumettre, demander l'arrêt, inspecter l'effet incertain, confirmer une reprise permise. Une modification concurrente exige relecture de la version |
| Fiche d'agent | Identité stable, spécialité, agent permanent ou temporaire, versions et capacités, moteur et fournisseur observés sur la tentative, état, disponibilité, droits effectifs et historique | Basculer de mission ou de tentative, ouvrir détail de performance et rapports qualité. Distinguer capacité autorisée de capacité présente. L'historique indique période, taille d'échantillon et taux, sans classement global non comparable |
| Quality Lab | Rapport relié au commit et au référentiel, couverture, confiance, preuve et dérogation | Examiner la preuve, comparer à référence compatible, lancer un contrôle éligible, ouvrir une décision de passage ou d'exception |
| Project Intelligence | Recherche, documents, versions, décisions, provenance et apprentissages à valider | Ajouter ou retirer un extrait avant gel du contexte. Accéder à la source si autorisé. Une version historique ne rétablit pas un droit retiré |
| Agent Office | Stations d'agents par projet, activité observée, capacité au travail, collaborations attestées et incidents | Filtres projet, mission, rôle et état. Une station ouvre ses sources. Une action sensible mène vers le détail d'autorité |

La recherche globale indique sa portée, permet des filtres par type et applique le droit à la source, à l'extrait et au compteur. Le journal d'activité supporte filtre, curseur et retour de contexte. Il distingue événement du Studio, observation de runner, reçu externe et décision humaine. Un événement visible ne donne aucun droit de relancer ni d'inspecter le contenu d'origine. Les notifications restent une entrée vers la preuve. Elles ne sont pas le lieu de décision.

## Wireframes textuels

L'ordre suit la conséquence et l'action disponibles. Les montants, états et rapports ci-dessous sont fictifs.

### Command Center · ordinateur

```text
┌ Folk & Joy Studio ─ Projet [Folk & Joy ▾] ─ Rechercher ─ Décisions (1) ┐
│ Command Center  |  Control Room  |  Quality  |  Intelligence  |  Office│
├─────────────────────────────────────────────────────────────────────────┤
│ À TRAITER MAINTENANT                   SANTÉ ET FRAÎCHEUR              │
│ P1 · Audit du commit de référence      Studio disponible · 10:42       │
│ Attend votre décision                 PC hors ligne · dernier 10:39   │
│ [Examiner la décision]                 GitHub synchronisé · 10:36       │
│                                                                        │
│ MISSIONS                              QUALITÉ ET EXPLOITATION           │
│ En cours 2 · Bloquées 1                Rapport bloquant · [Ouvrir]       │
│ Filtrer [actives ▾] [priorité ▾]        Sauvegarde exploitable · 06:10    │
│ Audit contexte       En préparation    Budget projet · 0 € autorisé     │
│ Revue doc            En exécution      Dépense rapprochée 0 €            │
│ [Voir les missions filtrées]           [Détail des réservations]         │
└─────────────────────────────────────────────────────────────────────────┘
```

Le cadre de santé indique l'heure de **chaque source**. Un tableau chargé maintenant peut afficher un signal ancien. « Données périmées » et « Jamais synchronisé » sont distincts de « 0 résultat ». Quand la visibilité de l'utilisateur change, les compteurs et aperçus sont réévalués. Les incidents critiques ne disparaissent pas parce que l'écran est réactualisé ou filtré.

### Détail de mission · ordinateur ou mobile

```text
< Missions / Audit du commit de référence         < Missions
Projet : Folk & Joy · Plan v3 · [Commit]          Audit du commit
En attente – approbation du plan                 Plan v3 · [Commit]
                                                En attente
Étape 1  Qualifier le contexte       Vérifiée     [Examiner l'approbation]
Étape 2  Contrôles indépendants      Attend
Étape 3  Publier le rapport Studio   Attend       Étapes (3)
                                                Contexte et destination
Contexte et destination  [Inspecter]             Budget et réservations
Montant maximal 0 € · aucun appel IA              Journal et preuves
[Examiner l'approbation] [Historique]
```

L'inspection du contexte montre source, version, extrait effectivement transmis, classification, ordre, destinataire et outils ayant des lectures additionnelles. Séparer le paquet observable des enrichissements internes d'un moteur. Quand une mission exige l'inspection exhaustive, un moteur incapable de la garantir est inéligible, selon la [qualification de failover](06-fournisseurs-et-strategie-failover.md). L'approbation indique **projet, version et empreinte de plan, cible, destination, conséquence et coût maximum autorisé**. Le retour du serveur confirme que cette version précise a été acceptée. Si le commit ou une règle opérante change, l'interface montre la nouvelle différence.

### Agent Office · atelier par stations

```text
Office · Projet [Folk & Joy] · [États] [Mission] [Vue liste]
Données reçues à 10:42 · dernier contact PC 10:39

┌ Coordination ─────────────┐    ┌ Qualité ────────────────────┐
│ Coordinatrice              │    │ Contrôle de régression       │
│ En préparation · 10:41     │    │ En attente d'approbation     │
│ Plan v3 · [Journal]        │    │ Commit de référence · [Preuve]│
└────────────────────────────┘    └───────────────────────────────┘

┌ Atelier exécution ─────────┐    ┌ Liaison ─────────────────────┐
│ Runner PC hors ligne       │    │ Rapport remis → revue       │
│ Dernière preuve 10:39      │    │ Reçu confirmé à 10:38        │
│ Tentative à rapprocher     │    │ [Ouvrir le livrable]         │
└────────────────────────────┘    └───────────────────────────────┘
```

Le MVP retient des zones 2D et des cartes stables. Une liste reprend exactement les données et actions, par défaut sur mobile. Une version isométrique demande une justification d'usage et garde la liste équivalente. Les bâtiments, bureaux et couleurs reconnaissables donnent son identité au Studio. Les états s'appuient sur des signaux observés. Une animation est facultative, finie et associée à un événement accepté. Les « réunions » représentent uniquement une revue effectivement ouverte ou un échange de livrable attesté. Un plan qui prévoit deux agents ne crée aucune réunion graphique.

## Contrat d'état et fraîcheur

Les projections sont construites à partir des événements métier autorisés. Chaque observation contient séquence de flux serveur, épisode d'exécution, source, heure reçue et niveau de preuve. Les identifiants affichés ou navigables respectent la portée de lecture. Un commentaire libre d'un agent n'alimente pas l'état. L'Office distingue trois couches **état métier, présence de capacité et fraîcheur de la vue**.

| Projection | Condition métier | Détail affiché |
|---|---|---|
| Disponible | Agent actif autorisé et aucune tentative présentée. Une capacité éligible est disponible selon la dernière observation | « Disponible » décrit le profil, pas un processus actif. En absence de capacité, indiquer ce qui est attendu |
| En préparation | Une étape de préparation autorisée a effectivement commencé | Début observé et plan visé |
| En exécution | Tentative démarrée, génération active, bail vérifié et signal récent | Origine et âge. Une demande d'exécution ou une file prête ne suffit pas |
| Collaboration | Remise, réception ou revue d'un livrable associée à des agents et une dépendance | Type d'échange, destinataire autorisé, preuve. L'activité visuelle devient statique à la fin |
| En attente d'approbation | Garde humaine active sur le plan ou effet courant | Cause, action attendue et expiration. L'écran indique si le lecteur peut décider |
| En erreur ou à rapprocher | Échec confirmé ou effet incertain selon le Studio | Priorité à l'état incertain quand une réémission n'est pas permise. Lien incident ou réconciliation |
| Terminée | Clôture durable de la mission ou de la tentative sélectionnée | Résultat et heure. Une tentative terminée ne clôture pas la mission entière |
| Déconnexion | Dernière présence expirée pour capacité liée à l'activité choisie | Dernier état métier et heure. Garder « Arrêt non confirmé » si nécessaire |

**Priorité et stabilité.** Dans une mission filtrée, privilégier la tentative active de cette mission. À défaut, mettre en avant un effet incertain, puis une décision bloquante, puis l'activité observée la plus récente. Conserver les autres signaux sous forme de badges distincts. Un runner absent avec une tentative incertaine affiche les deux informations. Le graphique ne réordonne pas les stations au milieu d'une interaction ni ne remplace une période sans donnée par un état nominal. Les chronologies Grafana documentent l'usage de lacunes visibles pour l'absence d'échantillon. Documentation consultée le 25 novembre 2026. [Chronologies d'états Grafana](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/state-timeline/)

**Accusés et erreurs.** Le serveur distingue demande enregistrée, en cours, confirmée, refusée et à rapprocher. Une perte de connexion pendant une mutation invite à relire l'état. Aucun envoi automatique renouvelé pour un effet sensible depuis le navigateur. Les signaux réseau du navigateur sont des indices. La validité dépend de la réponse et des droits effectifs. Un bouton bloqué affiche le motif et, si prévu, le rôle habilité à débloquer. Documentation consultée le 25 novembre 2026. [MDN, portée de l'état réseau navigateur](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine), [Primer, enregistrement et accusés](https://primer.style/product/ui-patterns/saving/)

**Coûts et preuve.** Montrer plafond autorisé, réservations ouvertes, coût rapproché et écart non attribué, avec devise et période. Une indisponibilité d'usage n'est pas représentée par zéro. En comparaison qualité, afficher explicitement populations comparables, preuves expirées et résultats non vérifiés. L'interface n'attribue pas à un agent la responsabilité d'un incident sans décision documentée.

## Arbitrage UX et accessibilité

Une liste compacte seule minimise les coûts et facilite les audits. Des stations 2D apportent l'identité demandée avec les mêmes éléments sémantiques et une navigation stable. Une carte isométrique exige plus de construction et complique densité et équivalence tactile. Retenir les stations 2D et l'alternative liste au MVP, à partir d'une seule projection. La vue liste a les mêmes liens de cause et de preuve que l'atelier. Aucun engagement de conformité n'est acquis avant essai.

Cible **WCAG 2.2 AA**, avec contraste ordinaire 4,5:1, couleur complétée par texte et forme, réorganisation du contenu à 320 px CSS, focus visible et accessible sous la navigation persistante, accès clavier et lecteur d'écran. Viser des cibles tactiles de 44 px sur les actions fréquentes. Un symptôme de santé sans couleur reste compréhensible. Les animations respectent la préférence de mouvement réduit. Un tunnel multi-étapes conserve sa progression après retour, selon la politique de données. Les annonces de statut regroupent les changements informatifs et ne forcent pas le focus, avec confirmation explicite pour l'action de l'utilisateur. Documentation consultée le 25 novembre 2026. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [dialogues WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [messages de statut](https://www.w3.org/WAI/WCAG22/quickref/)

## Tests d'acceptation spécifiques

| Cas | Mesure et preuve |
|---|---|
| Prioriser et agir à 320 px CSS | Ouvrir une décision, lire cible/coût/provenance et recevoir l'accusé sans glissement horizontal global. Refaire au clavier et lecteur d'écran |
| Mission en attente et rôle lecteur | Expliquer le motif sans action de décision disponible. La route de reprise vérifie aussi le droit au serveur |
| Coupure entre clic et accusé | L'écran relit l'état, montre le dernier fait confirmé et ne rejoue pas le clic. Le journal permet de confirmer l'intention enregistrée ou son absence |
| Changement de commit après approbation | Afficher l'ancienne décision dans l'historique et empêcher son application au nouveau candidat |
| PC hors ligne et tentative incertaine | Stations et liste montrent déconnexion et incertitude, sans « En exécution » ni animation d'activité |
| Échange de livrable reçu deux fois | Une seule représentation active pour l'échange logique, avec source et horodatage. Aucune réunion dérivée du plan seul |
| Révocation de projet | Supprimer des projections actives les extraits, détails, notifications et compteurs devenus inaccessibles. Un lien ancien ne restitue pas le titre masqué |
| Coût fournisseur indisponible | Les montants estimé et réservé restent visibles. La valeur rapprochée indique « inconnue » et les raisons de la suspension éventuelle |

Les wireframes et la projection sont proposés. La lisibilité sur appareils cibles, la réaction aux mises à jour, le contraste de rendu et l'utilité des stations sont à démontrer sur un prototype validé, après autorisation de développement.
