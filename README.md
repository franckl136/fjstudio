# Folk & Joy Studio

## Candidate locale 0.3.0-rc.1

Le Studio pilote plusieurs projets et leurs permissions sur un PC Windows. Le Command Center suit les missions. Project Intelligence gère les sources versionnées et leur validation. Le Control Room distribue les revues documentaires à des agents locaux. L’Agent Office affiche leurs baux réels. Quality Lab et App Lab qualifient et prévisualisent des sources Git dans des profils bornés.

La candidate du poste écoute sur **http://127.0.0.1:3040/**. Le Studio historique dispose de sa propre installation sur 3030. La branche de construction du produit est `feat/studio-product-foundation`.

- [Installer, démarrer et diagnostiquer](docs/product/exploitation.md)
- [Activer un compte avec mot de passe et TOTP](docs/product/acces.md)
- [Command Center et Agent Office](docs/product-workspace.md) · [Project Intelligence](docs/product/intelligence.md) · [Control Room](docs/control-room.md)
- [Quality Lab et App Lab](docs/product-lab.md) · [Campagnes de tests du Studio](docs/product-campaign.md) · [Revue Git](docs/product-review.md)
- [Sauvegarde et restauration](docs/product-recovery.md) · [Architecture](docs/product/architecture.md) · [Audit de départ](docs/product/audit.md)
- [Échange manuel et arbitrage des propositions](docs/product-handoff.md) · [Rapport de livraison et critères d’acceptation](docs/product/livraison.md)
- [Copier une sauvegarde chiffrée sur un second disque](docs/product-vault.md)

## Documents historiques et parcours A1

Folk & Joy Studio est un projet de plateforme privée de pilotage logiciel. Il vise à coordonner des missions humaines, déterministes ou assistées par IA, à conserver leurs preuves et à garder la maîtrise des permissions, des dépenses et des opérations sensibles. Folk & Joy est le premier projet envisagé. Son application est distincte du Studio.

## Dossier de conception

Le [cahier des charges maître](docs/00-cahier-des-charges-maitre.md) présente le périmètre, les critères d’acceptation et l’index des dix documents. Le dossier a été consolidé le **25 novembre 2026**.

| Module | Rôle prévu |
|---|---|
| Command Center | Suivre projets, missions, alertes, budgets et santé des services |
| Agent Control Room | Préparer les plans, coordonner les agents et gérer décisions, exécutions et reprises |
| Quality Lab | Produire des vérifications indépendantes liées au commit et à leurs preuves |
| Project Intelligence | Retrouver les connaissances sourcées, inspecter le contexte et valider les apprentissages |
| Agent Office | Présenter l’activité et la disponibilité observées des agents |

## Architecture et autonomie proposées

- Un monolithe modulaire TypeScript avec PostgreSQL comme source d’autorité, un worker et deux runners aux capacités distinctes.
- Des plans versionnés et des checkpoints vérifiables pour que les missions bornées continuent même sans fournisseur IA.
- Des moteurs interchangeables après qualification, avec permissions, confidentialité, budgets et validations humaines contrôlés par le Studio.
- Une intégration GitHub en lecture seule au MVP et une restauration vérifiée avant la remise en service des effets sensibles.

**Dossier de référence · Conception.** La publication de ces documents ne vaut pas validation du cahier des charges. La tranche A1 ci-dessous relève d’une autorisation distincte.

## Tranche A1 locale

La branche de réalisation A1 contient un parcours exécutable avec deux projets synthétiques, un plan déterministe et un verdict indépendant. La documentation de conception ci-dessus conserve son contexte historique. Voir [installation, recette et limites de la tranche A1](docs/a1-locale.md).

## Qualification G5.2 de Courses

La candidate Studio **0.2.0-rc.1** fournit un banc PostgreSQL, un parcours Chromium à froid et un catalogue de preuves vérifiables. Après `npm ci`, lancer `npm run quality:g52` depuis ce dossier. [Rapport de recette](docs/g5.2-recette.md) · [Guide de reproduction](docs/g5.2-quality-lab.md)
