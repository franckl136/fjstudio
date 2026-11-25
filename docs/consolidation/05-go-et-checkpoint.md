# Conditions de démarrage · roadmap et checkpoint

**25 novembre 2026 · proposition.** Ce document constitue le point de reprise. Le périmètre et les choix humains restent à approuver. Une autorisation séparée déclenche le développement. Les [arbitrages de revue](../review/13-decisions-et-arbitrages-a-valider.md) constituent l'historique. Le tableau ci-dessous les concentre sur les décisions encore utiles.

## Quatre décisions avec impact propriétaire

| Décision propriétaire | Recommandation | Alternative et conséquence |
|---|---|---|
| GO et périmètre du MVP | Autoriser une tranche locale A1 reproductible sur jeu synthétique, deux rôles, une mission manuelle et lecture des preuves. Qualifier ensuite le périmètre réel | Exiger dès le MVP la récurrence, le distant et G0 synchronisé augmente la charge avant la preuve du noyau. Préserver ces engagements comme critères conditionnels |
| Données, rétention et copie indépendante | Données synthétiques au départ, aucun envoi fournisseur, aucun accès prod. Attribuer l'accès au support indépendant, la rétention et le responsable de récupération avant données réelles | Faire entrer données Folk & Joy plus tôt exige inventaire, autorisations et contrôle des dérivés. Choisir destinataires, délais, suppression et export |
| Runner et autorité de production | Utiliser les chemins de confiance uniquement. Avant code candidat, qualifier la VM PC, le contrôle d'egress et la veille. Avant production, démontrer la décision humaine côté chaîne réceptrice | Runner distant ou CI si le PC ne passe pas la recette. Tout accès réel reste conditionné au propriétaire et à la sécurité |
| Accès distant, dépenses et App Lab | Rester local à 0 € de dépense nouvelle, tester Web local après A1. Déclencher disponibilité permanente, matériel iOS ou forfait cloud seulement sur besoin mesuré | Le VPS peut déporter le Core et l'alerte, tandis que le PC reste requis pour ses capacités. Fixer un plafond et une durée pour chaque pilote |

**Choix techniques à résoudre dans la tranche.** Paramétrer le modèle A1, choisir les versions compatibles, tester le contrat de file sur PostgreSQL, fixer formats d'artefact et clés de commande, implémenter le contexte projet et les politiques testables, choisir le moteur de recherche textuelle minimal. Les paramètres réversibles s'ajustent par mesure. Ni un fournisseur IA, ni un flux vidéo, ni un VPS ne conditionnent ce travail après GO.

## Trajectoire proposée

| Étape | Livrable attendu | Passage objectif |
|---|---|---|
| G0 Décision | Approbation du périmètre, du jeu fictif et de la borne 0 €. Inventaire du poste et des sauvegardes | Permission explicite de commencer le développement |
| G1 Tranche d'intégration locale | Authentification de l'opérateur, projet, plan typé, worker déterministe, état persistant | Une mission enregistrée et un rapport cohérent sur un projet fictif. Aucun fournisseur ou effet externe requis |
| G2 Reprise et contrôle | Checkpoint, génération, annulation, deuxième rôle, référentiel qualité indépendant | Crash avant et après validation, tentative périmée refusée, verdict lié à la preuve. Tester concurrence PostgreSQL et état confirmé plutôt que se fier à SQLite |
| G3 MVP local | Mémoire sourcée, inspection et révocation, deuxième projet, supervision, export et procédure de sauvegarde | Pertes de PC/worker simulées en intégration, aucun accès croisé, historique et rapport vérifiables, copie restaurée sur environnement séparé avant données réelles |
| G4 Pilotes distincts | GitHub G0, App Lab Web local et, si utile, runner isolé pour code candidat | Activation capacité par capacité et revue du coût. Le noyau A1 continue quand une capacité optionnelle manque |
| G5 Besoins avancés | Accès distant, VPS, Android, iOS, A2/A3, outils IA et effets réels selon demande | Arbitre, budgets, données, fin d'exécution, réconciliation et accès permanent homologués séparément |

Une tranche peut utiliser un référentiel de test minimal, avec preuves immuables et points d'extension. Ne pas faire dépendre la définition du terminé d'un tableau de bord exhaustif. Le MVP exige un état synthétique par projet et un parcours complet avec deux rôles, reprise, contrôle indépendant et cloisonnement. Conserver les critères de la [matrice précédente](../review/01-matrice-exigences-et-acceptation.md) comme historique, notamment les capacités mises hors périmètre local.

## Recettes à préparer après GO

| Recette | Critère | Stade |
|---|---|---|
| Parcours A1 | Deux rôles distincts attachés à un plan, au même projet et à des preuves versionnées. Aucun modèle appelé. Heure cible et cause de blocage visibles | G1–G2 |
| PostgreSQL concurrence réelle | Deux workers se disputent une étape, une attribution valide. Une mutation de génération périmée et un commit doublonné sont refusés | G2 |
| Récupération de l'état | Crashes transactionnels et redémarrage. Reprise du seul travail éligible. Un reçu inconnu de destination simulée bloque les actions dépendantes | G2 |
| Isolation projet | Accès base, recherche, fichiers, mémoire, journaux, scopes runner et révocation testés sur deux projets | G3 |
| Vérification indépendante | Un résultat candidat fabriqué ou un contrôle absent ne donne pas de verdict positif. Rapport porte référence, checks exécutés, confiance et éléments non couverts | G3 |
| Restaurer hors poste | Restaurer état et artefacts à partir de copie chiffrée sur autre support ou environnement jetable. Mesurer accès à la consultation et réouverture des effets séparément | G3 avant données réelles |
| Runner PC | OS et hyperviseur réels, veille et reconnexion, permissions et réseau limités. Aucun job non fiable admis avant preuve | G4 |
| App Lab | Deux sessions sous quotas, présence fraîche et logs filtrés, accès retiré en flux, ouverture depuis un autre projet refusée, HMR optionnel | G4, preuve distincte par plateforme |
| Exploitation distante | Sonde externe minimale lors de coupure totale, capacité de restauration et coût confirmé. 24 h de RPO et 4 h de lecture restent des cibles | G5 |

## Journal de reprise

| Cycle | Résultat et preuve | Suite |
|---|---|---|
| 1 Inventaire et audit | GitHub, l'ascendance et les 27 documents de référence examinés par thèmes. Écarts et niveaux de preuve dans [00](00-consolidation-et-audit.md) | Conserver le dossier initial |
| 2 Consolidation A1 et local | Contrat A1, exploitation locale et qualification sécurité, avec 1 080 gardes temporelles synthétiques et huit cas de veille dans [01](01-noyau-a1-et-reprise.md), [02](02-strategie-locale-et-couts.md) et [03](03-qualification-securite-et-exploitation.md) | Faire décider du périmètre et du support de sauvegarde |
| 3 App Lab | Étude officielle Web/natif/cloud, modèle de session et 512 évaluations synthétiques. Résultats et limites dans [04](04-app-lab.md) | Laisser App Lab hors passage obligatoire du MVP |
| 4 Revue finale | Revue indépendante des contraintes App Lab et des frontières. Contrôles des liens, de la confidentialité et de l'ascendance avant publication | Conserver l'état de reprise et publier les seuls documents |

**Point exact de reprise.** Lire [la synthèse](00-consolidation-et-audit.md) et le tableau des quatre décisions ci-dessus. Le prochain acte propriétaire est un **GO explicite pour la tranche locale**, avec délimitation des données et du périmètre. Ensuite inventaire en lecture seule du poste et préparation des preuves G1 à G3. App Lab, chaîne de production et dépenses restent des décisions d'activation distinctes. Les scripts de simulation isolés sont hors publication. Les chapitres décrivent ce qui est documenté, testé localement ou encore à vérifier. Le dépôt de Folk & Joy n'a pas servi de terrain de test.
