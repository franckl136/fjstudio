# Architecture et séquence de construction

Le produit conserve un monolithe Node 24 en TypeScript, PostgreSQL comme autorité durable et des workers séparés. Le Core authentifie l’opérateur, vérifie ses projets et valide chaque transition. Les vues HTML utilisent les mêmes services que les routes JSON. Les runners ne choisissent pas un chemin ou une commande à exécuter. Le plan désigne une capacité connue, une entrée bornée et les preuves attendues.

| Phase | Entrée et sortie attendues | Contrôle d’acceptation |
|---|---|---|
| A · Reprise | Reconstituer le noyau portable et figer les références | Migrations historiques et suites de non-régression |
| B · Pilotage | Objectif, tâches, risques, décision et évènements persistés | Commande rejouée, pause et reprise |
| C · Connaissance | Document Git, proposition sourcée, révision validée, contexte de mission | Cloisonnement et exclusions des fiches révoquées |
| D · Qualité | Profils bornés, exécutions, preuves et comparaison | Distinguer échec, réussite et contrôle absent |
| E · Contrôle | Plan par capacités, contrats, workers, baux et synthèse | Deux tâches indépendantes réellement exécutées, reprise contrôlée |
| F · Laboratoire | Version identifiée, prévisualisation isolée et capture | Réseau coupé, limites et nettoyage observés |
| G · Bureau | Postes et activité observés, liens aux tâches | Un runner silencieux ne paraît pas actif |
| H · Résilience | Comptes et sessions en recette, sauvegarde et restauration | Test des rôles, expiration, révocation, mise en quarantaine |
| I · Intégration | Recette intermodules et vérification du checkout livré | Parcours opérateur réel et registre des limites |

## Risques et décisions

Un rôle de lecture reçoit des données filtrées côté serveur. Un heartbeat n’atteste pas la réussite d’une tâche. Le compteur de génération et le bail bornent la remise de résultat. Une pièce de qualité porte le commit, le profil et l’empreinte. Une fiche proposée ne peut faire partie du contexte validé. Les secrets d’authentification restent hors des preuves et des processus de preview. Une restauration sur un nom neuf préserve la source et suspend les travaux ambigus. La cible distante est un runner sortant authentifié, après validation humaine du réseau et des droits.

ADR 001 · Le noyau G4 est réutilisé avec sa frontière par projet pour conserver l’historique et réduire les migrations. Une réécriture aurait imposé une nouvelle qualification du mécanisme de baux et de reprise. Les archives d’un pilote restent indépendantes du moteur générique et de ses fixtures. Les nouveaux modules se rattachent aux mêmes identités de projet et à la même base, avec leurs tables, événements et contrats explicites.
