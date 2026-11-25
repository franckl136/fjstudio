# 12 — Budget et scénarios économiques

**Folk & Joy Studio · Revue approfondie · 25 novembre 2026**

**Recommandation.** Base VPS-2 et dépôt de sauvegarde Hetzner BX11 à **12,49 € TTC/mois** aux prix publics relevés, soit **149,88 € TTC/an**, avant frais variables. Garder une enveloppe d’infrastructure de **20 à 30 € par mois** pour les coûts réellement nécessaires. Le plafond de prudence de **50 €** n’est pas une cible de dépense. Le budget IA reste **0 €** jusqu’à une décision explicite. Toute activation de forfait, extension de capacité ou achat reste à valider.

## 1 · Prix publics vérifiés

Sources consultées le 25 novembre 2026. Les prix OVHcloud sont des **prix TTC de départ** du catalogue France. Pour les Storage Box, un GET public a retourné HTTP 200 sur les pages françaises officielles. Le HTML contient à la fois un libellé accessible TTC et une offre structurée JSON-LD en EUR, avec unité mensuelle et indication TVA incluse. Le BX11 est donc vérifié à **3,84 € TTC/mois affichés** et le BX21 à **13,08 € TTC/mois affichés** à 20 % de TVA. Cette vérification actualise l’hypothèse du dossier de référence. Elle ne vérifie ni le prix du panier, ni le renouvellement, ni une remise propre au compte.

| Poste | Prix public TTC par mois | Capacité ou condition |
|---|---:|---|
| OVH VPS-1 | 4,57 € | 2 vCores, 4 Go, 40 Go, débit public annoncé 500 Mbit/s |
| OVH VPS-2 | 8,65 € | 4 vCores, 8 Go, 75 Go, débit public annoncé 1 Gbit/s |
| OVH VPS-3 | 12,48 € | 6 vCores, 12 Go, 100 Go, débit public annoncé 2 Gbit/s |
| Hetzner BX11 | 3,84 € | 1 To. SFTP, Borg ou Restic selon la méthode choisie |
| Hetzner BX21 | 13,08 € | 5 To. Extension seulement si le volume et la rétention le justifient |

Vérifier zone, disponibilité, TVA effective, engagement, frais de mise en service, renouvellement et options au panier avant une décision. Le débit public nominal ne donne pas le débit disque, de sauvegarde ou de restauration effectif. [Catalogue OVHcloud](https://www.ovhcloud.com/fr/vps/), [BX11](https://www.hetzner.com/fr/storage/storage-box/bx11/), [BX21](https://www.hetzner.com/fr/storage/storage-box/bx21/), [documentation Storage Box](https://docs.hetzner.com/storage/storage-box/general/)

**Preuve reproductible.** Lire la source HTML publique, sélectionner le document JSON-LD de type Product et dans son offre la spécification dont l’unité est MON. Comparer prix, devise et inclusion de TVA avec le libellé français mensuel. Le HT correspondant au BX11 est de 3,20 € sous l’hypothèse de TVA à 20 %. La preuve porte sur l’affichage de la page et ne crée aucune commande.

## 2 · Trois scénarios

Les coûts de domaine et d’électricité sont des **hypothèses de simulation**. Le domaine est compté à 12 €/an hors offres promotionnelles. Électricité aux hypothèses indiquées, avec un prix illustratif de 0,25 €/kWh. Aucun achat ni prix personnel n’a été vérifié. La surveillance gratuite suppose un canal extérieur disponible, qualifié et suffisamment fiable. L’entretien humain, les instances temporaires, un domaine plus cher, les options et une montée en charge IA ne figurent pas dans la somme de base.

| Poste mensuel | Minimal | Recommandé | Évolution future |
|---|---:|---:|---:|
| VPS | 4,57 € · VPS-1 | 8,65 € · VPS-2 | 12,48 € · VPS-3 |
| Sauvegarde externe | 3,84 € · BX11 | 3,84 € · BX11 | 13,08 € · BX21 |
| **Sous-total infrastructure** | **8,41 €** | **12,49 €** | **25,56 €** |
| Domaine, équivalent mensuel | 1,00 € | 1,00 € | 1,00 € |
| PC · électricité illustrative | 0,60 € · 60 W × 40 h | 1,25 € · 100 W × 50 h | 3,75 € · 150 W × 100 h |
| IA facturable | 0,00 € | 0,00 € | 0,00 € sans décision distincte |
| Outils externes de base | 0,00 € sous hypothèse | 0,00 € sous hypothèse | 0,00 € sous hypothèse |
| **Mensuel illustratif** | **10,01 €** | **14,74 €** | **30,31 €** |
| **Annuel illustratif** | **120,12 €** | **176,88 €** | **363,72 €** |

**Minimal.** Ce scénario privilégie le coût en conservant la sauvegarde externe. Le 4 Go et 40 Go est acceptable uniquement si PostgreSQL, indexation, worker et sauvegarde simultanés passent une recette avec marge. L’espace de travail du PC est jetable et les travaux lourds n’entrent pas dans la capacité du VPS.

**Recommandé.** Le VPS-2 ajoute 4,08 €/mois et double RAM et vCores annoncés par rapport au VPS-1. Pour une personne seule, cette marge réduit la pression opérationnelle durant un exercice de restauration, la rotation des journaux ou la reprise de travaux. C’est une recommandation documentaire à instruire par mesure. Un VPS de secours permanent n’entre pas dans ce scénario.

**Évolution.** Augmenter un poste selon le goulot observé. VPS-3 avec BX11 donne **16,32 €/mois d’infrastructure**, utile si le CPU ou la mémoire limitent le Studio. VPS-2 avec BX21 donne **21,73 €/mois d’infrastructure**, utile si la rétention restaurable sature le stockage de sauvegardes. Passer les deux postes à la fois coûte 25,56 €/mois d’infrastructure. Le total illustratif atteint alors 30,31 € avec domaine et PC. Une enveloppe IA future de 5 € ou 10 € porterait ce total à 35,31 € ou 40,31 €, avant aléas. Ces deux montants illustrent une sensibilité. Le budget autorisé en conception demeure nul.

## 3 · Ce qui peut rester gratuit et ce qui varie

| Poste | Traitement proposé | Condition ou risque |
|---|---|---|
| GitHub, documentation et CI | Distinguer les dépôts et leur visibilité. GitHub documente les conditions gratuites pour runners hébergés standard en dépôt public et les quotas selon plan | Minutes privées, grands runners, artefacts, images personnalisées et autres produits ont des règles propres. La gratuité de la documentation publique n’autorise pas l’envoi de code privé sur un dépôt public. [Facturation GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Logiciels du Studio | Surfaces communautaires ou libres lorsqu’adaptées. Prendre en compte exploitation, maintenance, sauvegardes et mises à jour | Une licence de code n’inclut ni exécution en cloud ni support payant |
| Ollama local | Budget API zéro si strictement local, modèle et egress vérifiés | Le PC peut être indisponible. La puissance moyenne doit inclure le fonctionnement réellement imputable aux tâches et éviter de compter deux fois sa charge de base. [FAQ Ollama](https://docs.ollama.com/faq) |
| Niveau gratuit d’une API | Pilote facultatif avec un compte dont le fonctionnement non facturable est prouvé et un contexte compatible | Quota, conditions, région et modèles peuvent changer. Aucun secours facturable automatique. [Prix Gemini](https://ai.google.dev/gemini-api/docs/pricing) |
| Surveillance et notifications | Utiliser une sonde hors hôte et un canal existant ou un niveau gratuit qualifié | Intervalle, nombre de sondes, notifications redondantes, délai et capacité de détection peuvent imposer un service distinct |
| Sauvegarde et exercices | Stockage chiffré externe, second support indépendant si requis. Mensualiser uniquement ce qui est réellement récurrent | Le tarif n’inclut ni copie indépendante ni hôte de restauration. Une période de chevauchement temporaire à 4,57–8,65 € est une provision indicative au tarif mensuel de départ. Le prix réel dépend de la durée et du panier |
| Temps d’exploitation | Enregistrer temps de mise à jour, restauration, réponse d’incident, rapprochement IA et renouvellement | Le coût du temps peut dépasser celui du VPS. Limiter le nombre de services et de contrats |

La sauvegarde locale annoncée avec l’offre VPS aide certains cas de reprise, tandis que le dépôt externe chiffré couvre la séparation d’hôte. La Storage Box fournit SFTP et des snapshots selon offre. Un snapshot de la même cible ne remplace pas une copie indépendante si la cible entière est perdue ou compromise. [VPS non géré OVHcloud](https://www.ovhcloud.com/fr/vps/unmanaged-vps/), [snapshots Hetzner](https://docs.hetzner.com/storage/storage-box/snapshots/), [accès Storage Box](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg/)

## 4 · Déclencheurs économiques mesurables

| Mesure | Seuil de travail à qualifier | Réponse proposée |
|---|---|---|
| Espace VPS | Avertissement à 70 %, blocage des nouvelles tâches volumineuses à 85 % | Vérifier rétention et artefacts, protéger l’espace de reprise, puis redimensionner si la charge légitime persiste |
| Espace BX11 et croissance | Avertissement à 70 % avec tendance et volume après compactage de la rétention | Optimiser la politique sans supprimer de point requis. Évaluer BX21 si le seuil persiste sous les obligations RPO/RTO |
| CPU et RAM | Charge durable et marge basse pendant sauvegarde et exécution | Requalifier limites de concurrence et dimensionnement. Ne pas dégrader le contrôle qualitatif pour économiser quelques euros |
| Disponibilité et restauration | Échec à respecter le RPO de 24 h ou le RTO de 4 h du dossier de référence lors d’un exercice représentatif | Mesurer transfert, vérification et réconciliation. Identifier le goulot avant de changer de machine ou de stockage |
| Dépense variable | Budget, réservations et usage par projet. Alertes 70 % et 90 % sur budget IA autorisé | Refus transactionnel en cas de plafond. Maintenir la réserve si l’appel précédent reste incertain. Aucune recharge |
| Prévision récurrente | Au-delà de 30 €/mois, expliciter les postes et leur preuve de valeur. Approche des 50 €, suspendre les engagements additionnels en attente d’arbitrage | Comparer au besoin, au coût d’exploitation et à l’alternative la plus simple |

**Cas de double dépense.** Un timeout n’efface ni la réservation ni l’exposition du premier appel. Un basculement de calcul pur nécessite un budget disponible pour les deux tentatives et une politique explicite. Une écriture externe incertaine doit être rapprochée avant de recommencer. Les détails d’attribution, d’homologation et de prix des modèles figurent dans [fournisseurs et failover](06-fournisseurs-et-strategie-failover.md).

**À valider avant engagement.** Panier de renouvellement et taxes, canal d’observation indépendant, coût réel du nom de domaine, volume projet et politique d’artefacts, preuve de restauration sur un environnement vierge, tarif électrique et disponibilité du PC. Les prix affichés ont été relevés sur des sources publiques. Les montants annuels supposent douze mois au même tarif. Les évolutions sont des scénarios, sans achat ni activation.


**Vérification de calcul.** Un contrôle local en décimal a confirmé les trois totaux mensuels et annuels illustratifs, avec les hypothèses de puissance, durée et prix du kWh données ci-dessus. Il ne mesure pas la consommation du PC.
