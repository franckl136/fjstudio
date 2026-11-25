# Folk & Joy Studio

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
