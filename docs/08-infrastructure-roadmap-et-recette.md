# Infrastructure, coûts, roadmap et recette

Proposition du 25 novembre 2026. Les besoins de calcul lourd restent sur PC. Les déploiements du Studio et de Folk & Joy sont séparés.

## Infrastructure et coûts

| Configuration | CPU, RAM et NVMe | VPS TTC par mois | Avec BX11, estimation TTC | Année estimée |
|---|---|---:|---:|---:|
| OVH VPS-1 | 2 vCores, 4 Go, 40 Go | 4,57 € | 8,41 € | 100,92 € |
| OVH VPS-2 | 4 vCores, 8 Go, 75 Go | 8,65 € | 12,49 € | 149,88 € |
| OVH VPS-3 | 6 vCores, 12 Go, 100 Go | 12,48 € | 16,32 € | 195,84 € |

Les VPS sont aux tarifs publics « à partir de ». Le BX11 de 1 To est documenté. L'hypothèse de 3,20 € HT, soit 3,84 € TTC à 20 %, reste à confirmer au panier officiel. L'année suppose le prix mensuel constant et exclut domaine, électricité PC, VPS temporaire de restauration et éventuels suppléments CI ou notifications. Le VPS-2 fournit de la marge pour PostgreSQL, l'indexation et les captures de sauvegarde concurrentes, pour 4,08 € de plus que le VPS-1. Le VPS-1 peut suffire après un test à charge représentative. Le VPS-3 attend un besoin mesuré. [OVHcloud VPS](https://www.ovhcloud.com/fr/vps/), [Hetzner BX11](https://www.hetzner.com/fr/storage/storage-box/bx11/)

Sur 75 Go, enveloppes provisoires de 15 Go système et images, 10 Go base et index, 15 Go artefacts et 10 Go journaux et exports temporaires, laissant 25 Go de marge. Mesurer la mémoire pendant une sauvegarde et une indexation. Alerter à 70 % de disque, freiner les nouvelles tâches volumineuses à 85 %. Pour 20 Go et 100 Mbit/s de débit utile, environ 27 min de transfert avant restauration. Le débit réel et les RPO/RTO exigent une restauration chronométrée.

Le socle garde le budget IA à 0 €. Un éventuel pilote ne peut engager une dépense avant autorisation du propriétaire. Voir 04 pour la tarification et la qualification.

## Choix et remplaçabilité

| Choix | Justification | Alternative ou déclencheur |
|---|---|---|
| pg-boss sur PostgreSQL | MIT, transaction et planification, une dépendance d'exploitation existante | Graphile Worker si avantage démontré sur les jobs ou adaptateurs. Temporal si le coût de maintenance des workflows croît significativement |
| Recherche textuelle PostgreSQL | Une source de vérité, isolation et index simples | Similarité trigramme pour variantes et identifiants. Recherche sémantique uniquement après mesure des lacunes, avec purge et classement contrôlés |
| VM PC et runner VPS de confiance | Sépare le code candidat et le plan de contrôle avec coût limité | CI de confiance en seconde preuve ou autre hyperviseur selon OS, budget et posture validés |
| Better Auth et TOTP | MFA et parcours utilisateur intégrés au monolithe | Passkeys après recette du domaine, de la récupération et de la vérification utilisateur |
| Volume local et Restic | Moins de services, sauvegarde chiffrée hors hôte | Stockage objet si croissance vérifiée. Borg si mieux maîtrisé par l'exploitant |
| Intégrations directes et adaptateurs | Permissions, coûts et contexte visibles au niveau du Studio | Proxy multi-fournisseur seulement si sa maintenance, ses droits et sa couverture de facturation sont qualifiés |

[pg-boss](https://github.com/timgit/pg-boss), [Graphile Worker](https://worker.graphile.org/docs/job-key), [Temporal](https://docs.temporal.io/workflows), [trigrammes PostgreSQL](https://www.postgresql.org/docs/current/pgtrgm.html), [Better Auth](https://better-auth.com/docs/plugins/2fa).

## Roadmap proposée

| Incrément | Condition de passage |
|---|---|
| Cadrage | Autorisation distincte de lancer le développement. Inventaire de Folk & Joy et du PC, accès de secours, prix au panier et chemin humain de production |
| Socle | MFA, politiques, données, volumes, sauvegarde et exercice de restauration sur instance vierge |
| A1 | Plan borné, deux runners, poursuite en l'absence d'IA, états durables et vérification défensive indépendante |
| Premier raccordement complet | GitHub en lecture, recherche, Agent Office live, rapport exportable et notification externe |
| A2 | Plan proposé sous schéma, équipe sélectionnée par politique, contrôle des ressources et expérimentation de qualité, coûts et permissions |
| A3 | Replanification à partir d'étapes futures, budget borné, critères de progrès et restauration des invariants. Capacités sensibles et écritures GitHub dans une recette distincte |

## Matrice de recette bloquante

| ID | Préparation | Attendu |
|---|---|---|
| T01 | Deux projets, deux utilisateurs, rôles différents | Données, mémoire, artefacts, recherche et notifications restent isolés, y compris après droit révoqué |
| T02 | Fournisseurs désactivés, PC disponible puis indisponible | A1 termine le calcul déterministe, attend clairement le PC pour ses tâches, puis poursuit sans intervention répétée |
| T03 | Deux demandes d'attribution et une fin tardive | Un seul bail contrôlant. Fin tardive sans mutation métier |
| T04 | Crash après le commit de l'étape et avant le lancement aval | Plan récupéré et chaque décision durable visible. Aucun double effet logique |
| T05 | Effet distant réussi, accusé perdu | Intention en réconciliation, aucune répétition automatique. Nouvelle décision si la source distante ne permet pas de conclure |
| T06 | Révocation après attribution, avant action | Mutation et nouvelle sortie refusées. Effet déjà parti traité séparément |
| T07 | Deux engagements en concurrence sur un solde de mission | Pas d'engagement au-delà du plafond sous transaction. Rapprochement du timeout et de la fenêtre de facturation |
| T08 | Mauvaise stratégie, sorties répétées et changement de modèle | A3 s'arrête au seuil de non-progrès ou à la limite. Aucun nouveau droit, crédit ou destination |
| T09 | Agent auteur modifie sa propre suite de tests | Le référentiel indépendant et ses preuves restent distincts. Un contrôle obligatoire absent ne donne pas de passage |
| T10 | Mémoire contradictoire ou ancienne, puis retrait de droit | Divergence visible, source obligatoire, ancien paquet réévalué avant tout nouvel envoi |
| T11 | Webhook double, tardif et manquant | Signature vérifiée, doublon absorbé, réconciliation paginée sans régression |
| T12 | VPS et base indisponibles, PC en veille | Sonde externe alerte. Aucun nouvel effet ni accusé perdu. Après reprise, contrôles confirmés avant reprise de capacité |
| T13 | Snapshot antérieur à un effet déjà exécuté | Nouvelle époque et sorties fermées. Réconciliation puis décision humaine lorsque l'effet demeure inconnu |
| T14 | Audit du dossier sur PC et mobile | Navigation clavier, contexte et approbation compréhensibles. Agent Office affiche l'horodatage et la cause des attentes |
| T15 | Version de moteur ou conditions modifiées | Désactivation du profil concerné et maintien de la preuve historique. Aucune bascule non qualifiée |
| T16 | Exercice de défaillance après restauration | RPO 24 h et RTO 4 h mesurés sur le volume cible. Date de réouverture des effets sensibles enregistrée séparément |

Les dix-huit scénarios détaillés du dossier maître sont la base de couverture. Cette matrice ajoute la révocation en vol, la mémoire contradictoire et la perte d'un effet après restauration. Le dossier de vérification distingue les simulations locales et les recettes restant à réaliser.

## Licences du socle

Next.js et Better Auth publient leur cœur sous MIT, pg-boss également. PostgreSQL utilise la PostgreSQL License et Restic BSD-2-Clause. Ces constats documentaires concernent les projets de référence. La distribution Docker, les dépendances, les extensions et les modèles ont leurs propres conditions. À la sélection des versions, conserver les avis de licence applicables et la liste des composants réellement redistribués. Les modèles locaux doivent être qualifiés pour leurs poids et l'usage prévu indépendamment du moteur.

[Licence Next.js](https://github.com/vercel/next.js/blob/canary/license.md), [licence Better Auth](https://github.com/better-auth/better-auth/blob/main/LICENSE.md), [pg-boss](https://github.com/timgit/pg-boss), [licence PostgreSQL](https://www.postgresql.org/about/licence/), [licence Restic](https://github.com/restic/restic/blob/master/LICENSE).
