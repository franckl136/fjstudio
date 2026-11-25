# Consolidation avant développement · audit et décisions

**25 novembre 2026 · recommandation soumise au propriétaire.** L'état GitHub vérifié avant travaux était main au commit 61490adddd45ed8f3208d368c3f8d326023449fb et docs/revue-approfondie au commit ea03250c59eccd4a0e213ed6ce0bea3fe4e8bf55, cinq commits et 17 ajouts documentaires au-dessus de main. Aucun PR n'était présent. Cette consolidation dérive de la revue, conserve les 10 documents initiaux et les 17 documents de revue et précise leurs écarts. La mission de conception ne rend aucune proposition définitive.

## Diagnostic

**Le MVP est prêt pour une décision de lancement local, sous réserve du périmètre et des politiques ci-dessous. Le projet n'est pas qualifié pour l'exploitation permanente, les jobs non fiables sur le PC, la production ou les fournisseurs payants.** Son risque principal n'est plus le choix du framework. Il réside dans les frontières entre état durable, exécution dont le Studio connaît l'issue et effets dont la destination est seule autorité.

Le projet gagne à démontrer **une mission A1 locale** qui passe par deux rôles déterministes, survit à une interruption contrôlée et produit un verdict indépendant. Un second projet de test sert à éprouver l'isolation. Les contrats doivent être exploitables par une personne seule. Des rôles séparés peuvent être attribués à des contextes d'exécution indépendants, sans simuler la présence de deux personnes ou prétendre qu'un même hôte compromis constitue deux frontières de confiance.

## Audit par blocs de documents

| Références | Ce qui tient | Fragilité ou doublon | Proposition et incidence |
|---|---|---|---|
| [Maître](../00-cahier-des-charges-maitre.md), [synthèse revue](../review/00-synthese-audit-complet.md), [lacunes](../review/02-audit-contradictions-et-lacunes.md) | Principes stables et distinctions entre recommandation et preuve | Deux niveaux documentaires peuvent devenir deux cahiers de recette concurrents | La présente consolidation référence les preuves antérieures et indique ses seuls changements de périmètre |
| [Données](../01-architecture-et-donnees.md), [architecture revue](../review/10-architecture-technique-et-deploiement.md) | Noyau modulaire, PostgreSQL, contrats de ressources | File générique, cadence, deux runners et VPS prévus ensemble | Commencer avec Core, PostgreSQL, worker local et une capacité locale. Retarder la file supplémentaire et la distribution tant que le cas réel n'en dépend pas |
| [Autonomie](../02-autonomie-et-agents.md), [exécution](../review/03-architecture-autonomie-et-execution.md), [agents](../review/04-architecture-multi-agents.md) | Plans bornés, transitions, tentatives et effets | Risque de payer le coût de A2/A3, dépendances inter-missions et récurrence avant un résultat A1 | Une mission manuelle, un graphe fixé et deux rôles. Faire la recette réelle des transitions d'abord. Les autres contrats restent documentés |
| [Mémoire d'origine](../03-memoire-et-apprentissage.md), [mémoire revue](../review/05-memoire-et-apprentissage.md) | Provenance, versionnement, cloisonnement, révocation | Réunir mise en mémoire, apprentissage et recherche avancée crée une dépendance inutile | MVP avec documents et résultats sourcés, recherche lexicale et retrait d'accès. Promotion et hybride attendent corpus et politique |
| [Moteurs initiaux](../04-fournisseurs-et-moteurs.md), [qualification et failover](../review/06-fournisseurs-et-strategie-failover.md) | Identité d'agent indépendante du moteur, garde du contexte et du budget | Risque de traiter abonnement, API, CLI et moteur comme équivalents. Secours à 0 € non garanti | Aucun moteur distant au MVP. Exécution déterministe et option locale qualifiée seulement. Adaptateurs et fiches moteur séparés |
| [Interface](../05-experience-et-agent-office.md), [UX de revue](../review/09-ux-command-center-agent-office.md) | Projections fondées sur des événements | Un éditeur de plans, plusieurs surfaces autonomes et les previews risquent d'élargir le MVP | Un détail de mission et une file de décisions réutilisables par les cinq modules. Agent Office 2D simple. App Lab dans le contexte projet après A1 |
| [Qualité et état](../06-qualite-et-observabilite.md), [qualité de revue](../review/08-quality-lab-et-observabilite.md) | Verdict sourcé et niveaux de preuve | La preuve du candidat peut être relue comme preuve indépendante et la télémétrie comme verdict | Référentiel et contrôle séparés, état « non vérifié » visible. Endpoint de santé distinct du résultat d'une mission |
| [Sécurité initiale](../07-securite-runners-et-resilience.md), [menaces](../review/07-security-threat-model.md) | Contrôles des outils, du bail, du secret et du runner | WSL2, veille, anciens expéditeurs et autorité distante demeurent non qualifiés | Première tranche synthétique de confiance. Porte de qualification avant exécution de code non fiable, accès distant et effets réels |
| [Coûts et roadmap](../08-infrastructure-roadmap-et-recette.md), [budget](../review/12-budget-et-scenarios-economiques.md), [MVP précédent](../review/14-roadmap-et-definition-du-mvp.md) | Tarif et critères d'acceptation documentés | VPS et sonde extérieure peuvent être lus comme prérequis alors que le besoin immédiat est local | Distinguer dev, usage local et exploitation permanente. Rebaser les critères de passage sur les capacités activées, sous validation du périmètre |
| [Vérifications](../09-verifications-risques-et-checkpoint.md), [matrice](../review/01-matrice-exigences-et-acceptation.md), [recette](../review/11-scenarios-de-recette-et-tests.md) | Simulations traçables | SQLite, prédicats et contraste colorimétrique n'établissent pas concurrence PostgreSQL, isolation ou accessibilité | Garder les résultats. Définir des tests futurs par frontière et une preuve nommée par critère |
| [Décisions](../review/13-decisions-et-arbitrages-a-valider.md), [risques](../review/15-registre-des-risques.md), [checkpoint](../review/99-checkpoint-de-travail.md) | Dix arbitrages documentés et risques suivis | Le matériel, la production et la restauration ont des horizons différents | Regrouper les choix humains en quatre décisions et libérer les choix techniques réversibles |

## Choix techniques recommandés et réversibilité

1. **Core modulaire et PostgreSQL** conservent missions, politiques, preuves, mémoire et coûts. L'interface et le worker ont des cycles séparés, avec PostgreSQL comme autorité. Une file métier minimale réutilise les lignes d'étapes et un balayage au MVP. pg-boss reste une évolution si la cadence ou les travaux asynchrones indépendants le justifient. Le passage est réversible si la file reste un mécanisme de réveil.
2. **A1 déterministe avant les modèles.** Deux rôles apportent preuve de collaboration et contrôle indépendant. Le budget non autorisé est refusé par construction. Le modèle de coût et d'effets reste extensible. Un faux connecteur reproduit les cas ambigus sans opération distante.
3. **Poste existant avant VPS.** Une configuration locale démontre produit et reprise avec zéro abonnement obligatoire si matériel, licences et support de sauvegarde existent. Disponibilité permanente, accès distant et exécution de code non fiable déclenchent des qualifications distinctes.
4. **Recherche et UX simples.** Provenance et historique avant embeddings. Vue de décision et détail de mission communs aux modules. Un espace de preview indépendant complète le projet à un jalon ultérieur.
5. **Qualification par preuve.** Distinguer simulation locale, tests d'intégration contrôlés et preuves de service réel. Aucun volet tiers ne peut être déclaré validé par un succès sur fixtures.

## Risques dominants après revue contradictoire

| Point de vue | Objection réelle | Réponse et preuve qui manque |
|---|---|---|
| Produit et architecture | Le MVP pourrait devenir un ensemble d'intégrations avant de savoir clore une mission | Une tranche A1 minimale, sortie vérifiable, aucune dépendance aux previews ou fournisseurs. Réaliser une recette reproductible |
| Sécurité | Le processus d'un runner ou un ancien hôte peut agir au-delà du bail et une preview peut exposer une autre origine | Lien projet/session, absence d'effets distants au MVP, quiescence et rapprochement avant reprise, qualification VM et navigateur avant extension |
| Exploitation | Une installation locale, une copie externe et un Mac ne sont pas acquis. Un seul opérateur peut perdre l'accès au poste et au point de reprise | Inventaire, support indépendant déjà disponible, exercice hors poste et objectifs conditionnés à une preuve. VPS uniquement pour un besoin durable |

## Lecture de la consolidation

- [01 Noyau A1 et reprise](01-noyau-a1-et-reprise.md)
- [02 Stratégie locale et coûts](02-strategie-locale-et-couts.md)
- [03 Qualification, sécurité et exploitation](03-qualification-securite-et-exploitation.md)
- [04 App Lab](04-app-lab.md)
- [05 Conditions de démarrage et checkpoint](05-go-et-checkpoint.md)
