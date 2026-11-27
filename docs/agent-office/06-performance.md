# Performances du loft

## Mesures sur le PC Windows

Chrome 158.0.8127.89 en mode headless, fenêtre 1440 × 900, 27 novembre 2026. Chacun des trois contextes charge les assets du Studio via Playwright et les vues HTML du worktree. Les agents sont synthétiques. Aucun service de projet ne reçoit de requête.

| Présences sur scène | Marcheurs simultanés observés | Plan et textures prêts | Intervalle médian des callbacks rAF | P95 | Temps occupé du thread renderer | Tâches en visibilité masquée, sur 2,2 s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 1 | 146,3 ms | 2,8 ms | 2,9 ms | 5,9 % | 0,4 ms |
| 36 | 33 | 204,8 ms | 2,8 ms | 2,9 ms | 10,5 % | 0,7 ms |
| 100 | 97 | 183,1 ms | 2,8 ms | 2,9 ms | 14,9 % | 1,2 ms |

Les durées de chargement incluent navigation, interception de la requête, génération de la vue serveur, lecture des fichiers, montage et disponibilité des deux textures. Une mesure par charge permet de repérer une régression grossière. Le réseau réel, le serveur PostgreSQL et la latence de production sortent de cet essai. [Mesures brutes](captures/performance.json)

## Mouvement et occupation du navigateur

Le test réaffecte simultanément tous les runners disponibles, attend le début du déplacement, puis mesure au minimum 1,5 s. Le nombre de marcheurs est lu dans les éléments effectivement animés. La médiane et le 95e percentile proviennent de 538 à 540 intervalles rAF du banc headless. Cet intervalle mesure la disponibilité de la boucle du navigateur, pas la fréquence des images réellement présentées sur un écran physique. Les déplacements sont calculés à 60 Hz au plus, et à 30 Hz au-delà de 40 personnages. Les poses utilisent une cadence moindre. Les quatre personnages d’ambiance ont également terminé un changement de destination en mode simulation.

Le pourcentage de temps occupé vient du delta de `Performance.getMetrics().TaskDuration` divisé par la durée de l’échantillon. Il concerne les tâches du renderer, sonde comprise. La consommation CPU totale du processus Chrome, du GPU et de Windows reste non qualifiée. Au cours de la mise au point, 97 déplacements sollicitaient 65,1 % du temps du renderer sur ce banc avant le plafond de fréquence. La dernière passe a mesuré 14,9 % pour cette charge. Une comparaison reproductible entre machines demande plusieurs répétitions dans les mêmes conditions.

## Onglet masqué

Le test déclenche le gestionnaire Page Visibility avec une valeur `document.hidden` contrôlée. Les marches cessent et aucune lecture de suivi n’est observée pendant les 2,2 s mesurées. Il gèle ensuite le renderer 1,7 s via le protocole DevTools et vérifie de nouveau l’absence de lectures. Le dégel et le retour à la visibilité relancent le suivi. Une bascule manuelle entre deux onglets d’un Chrome visible et la reprise après mise en veille de Windows restent à qualifier.

## Relancer le benchmark

Exécuter `node scripts/office-2-browser.mjs --load-only`. Le fichier JSON inclut la version de Chrome, la date, les tailles d’échantillon et les valeurs détaillées. Le mode complet vérifie aussi la réduction des mouvements et l’absence d’erreurs JavaScript sur les parcours de recette.
