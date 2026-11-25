# Campagnes de tests du Studio

Une campagne exécute successivement `npm run typecheck` et `npm test` dans le dépôt local du Studio. Elle publie son résultat dans **Quality Lab → Campagnes de tests du Studio**, pour les membres du projet `a`. Le lecteur peut y consulter une campagne. Le déclenchement est réservé à la console locale de l’administrateur.

## Lancer une campagne

Le dépôt du Studio doit être propre, sous Git, avec l’origine configurée pour `franckl136/fjstudio`, les dépendances installées et les deux scripts npm approuvés. Le service PostgreSQL du Studio doit être démarré en boucle locale, migré et accessible par le fichier `.env.local`. Les images Docker requises par la suite doivent déjà être présentes. Sur le poste de qualification produit, ouvrir PowerShell dans la racine du Studio et exécuter ces commandes.

```powershell
$env:COMPOSE_PROJECT_NAME = 'fjstudio-product'
npm.cmd run quality:studio
```

Le script utilise uniquement le checkout qui le contient et les deux commandes prédéfinies. Il ferme l’entrée standard, laisse npm hors ligne et désactive les hooks npm additionnels. Un verrou PostgreSQL assure une seule campagne à la fois pour cette instance. Le délai maximal par commande est de 30 minutes. Le script affiche les étapes, puis un reçu contenant l’identifiant, le verdict, le commit et les compteurs. Les résultats HTML sont disponibles sous `/projects/a/quality/campaigns`. La même ressource et le détail `/<uuid>` sont accessibles en JSON en ajoutant le préfixe `/api`.

## Lire le résultat

Le rapport conserve les commits avant et après, l’état Git de départ et d’arrivée, les versions de Node.js, npm, Git et TypeScript, les dates, la durée de chaque commande et son code de sortie. Le contrôle de l’arbre couvre les fichiers suivis et les fichiers non suivis que Git signale. Il respecte les exclusions Git, notamment les fichiers locaux de configuration et les dépendances installées. Les contrôles sont effectués aux deux bornes de la campagne.

La suite Node fournit le total, les réussites, les échecs, les annulations, les tests ignorés et les tests à faire. Les noms de tests, sorties brutes, diagnostics, chemins de travail et valeurs d’environnement ne sont pas stockés dans le rapport. Les octets des deux flux de chaque commande contribuent à leurs empreintes SHA-256. Le reçu contient aussi l’empreinte SHA-256 de la représentation canonique du rapport. La consultation du détail vérifie l’empreinte et la cohérence du verdict.

| Verdict | Lecture |
| --- | --- |
| `PASS` | Arbre propre et même commit aux deux bornes, typage réussi, suite achevée avec au moins un test et tous les tests réussis. |
| `PASS WITH RESERVATIONS` | Les commandes ont réussi et la suite signale des tests ignorés ou à faire. |
| `FAIL` | Une commande s’est terminée en erreur ou la suite signale des échecs. |
| `NOT QUALIFIED` | Le checkout a évolué, une commande a été interrompue, ou les deux commandes ont réussi avec un bilan de tests absent, vide ou incomplet. |

Un arbre déjà modifié ou une autre campagne active bloque le départ. Un arrêt du processus avant l’enregistrement ne produit aucun reçu de réussite. La liste conserve les cent campagnes les plus récentes à l’écran, avec leur empreinte disponible dans les détails.

## Tester la collecte indépendamment

```powershell
$env:COMPOSE_PROJECT_NAME = 'fjstudio-product'
node --env-file=.env.local --test --test-concurrency=1 test/product-campaign.test.ts
```

La suite de collecte utilise des flux synthétiques et sa propre base `fjstudio_a1_test_<UUID>`. Elle vérifie les bilans fragmentés ou ambigus, les verdicts, le cloisonnement, les droits de lecture et le rejet d’un rapport dont l’empreinte diverge.
