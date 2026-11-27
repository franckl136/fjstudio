# Recette du loft

## Reproduire sur Windows

Depuis la racine du worktree équipé des dépendances du Studio, exécuter `node scripts/office-2-browser.mjs` puis `node scripts/office-pixel-browser.mjs`. Le premier parcours écrit les captures et les mesures dans `docs/agent-office/captures`. Utiliser `STUDIO_QA_OUTPUT` pour choisir un autre répertoire, `STUDIO_QA_BROWSER` pour indiquer un exécutable de navigateur compatible. L’option `--load-only` exécute uniquement la mesure de charge.

Playwright ouvre un contexte Chrome neuf par scénario. Il intercepte toutes les lectures de la page Agent Office, rend le HTML avec les vues du Studio et charge les véritables scripts, styles et images de la branche. L’origine de recette répond depuis la mémoire du test. Un accès extérieur ou une requête en écriture fait échouer la vérification. Les transitions sont pilotées par des modifications de la fixture en mémoire. La recette ne nécessite aucune session personnelle.

## Parcours qualifiés

| Parcours | Observation contrôlée |
| --- | --- |
| Plan et salles, 1440 × 900 | Quatre salles, compteurs 1/1/1/1, quatre présences visibles, focus par salle, retour au plan |
| Présence et historique | Quatre contacts frais, trois baux actifs, un disponible, un hors ligne, une session terminée, deux identités à l’état inconnu. Deux PR d’une seule session Cursor donnent une seule fiche. La pause reste non renseignée |
| Sélection et navigation | La touche Entrée ouvre une fiche depuis un avatar. Liens vers poste, projet, mission et preuves vérifiés dans la vue rendue. Le filtre Cursor conserve la fiche du bon fournisseur |
| Inspection d’un poste | Au Bureau, le repère occupé ouvre un panneau avec un lien vers Milo. Le second repère indique une place libre dans le loft |
| Changement d’état | Affectation de Nora au Bureau après lecture du fragment. Le même élément DOM traverse le loft et termine le déplacement. L’ancienne recette teste également un passage bref, le retour au Café et la relecture du passage |
| Ambiance | Quatre figurants et mise à jour de leur destination après un cycle. Les métriques opérationnelles restent identiques, aucune écriture réseau |
| Caméra, 1920 × 1080 | Vérification de la Fullscreen API réelle, zoom 125 %, panoramique au clavier, recentrage, focus Contrôle et sortie |
| Petit écran, 390 × 844 | Choix tactile d’une pièce et d’un personnage. Aucun débordement horizontal. Avec le réglage de réduction des mouvements, l’état et la position se mettent à jour sans marche |
| Dégradation | Recette historique à 1366 et 390, rendu sans atlas, poste accessible sans JavaScript, 18 personnages sur le grand plateau |
| Charge et arrière-plan | 4, 36 et 100 présences de test. Branche de visibilité exercée par événement contrôlé et gel du renderer par CDP. Détails et réserves dans [la mesure de performance](06-performance.md) |

## Captures de la fixture

| Vue | Fichier |
| --- | --- |
| Avant, commit 98dc155 | [Plan initial](captures/00-avant.jpg) |
| Plan complet | [Vue d’ensemble](captures/01-plan.jpg) |
| Bureau | [Postes de préparation](captures/02-bureau.jpg) |
| Café | [Accueil des personnes disponibles](captures/03-cafe.jpg) |
| Réunion | [Synthèse du carnet](captures/04-reunion.jpg) |
| Contrôle | [Vérification en cours](captures/05-controle.jpg) |
| Fiche | [Fiche agent et mission](captures/06-fiche.jpg) |
| Plein écran | [Plan en 1920 × 1080](captures/07-plein-ecran.jpg) |
| Mobile | [Vue tactile en 390 × 844](captures/08-mobile.jpg) |
| Ambiance | [Quatre figurants](captures/09-ambiance.jpg) |
| Déplacement animé | [Nora quitte le café pour le bureau](captures/10-deplacement.webp) |

La référence avant provient d’une extraction Git de `98dc155` et du même atelier synthétique en 1440 × 900. Pour la refaire, pointer `STUDIO_QA_SOURCE` vers une extraction locale de ce commit dotée des dépendances du Studio puis exécuter `node scripts/office-2-browser.mjs --before`. Ces images et mesures concernent Chrome desktop et l’émulation d’une petite fenêtre tactile. Les revues sur appareil physique, navigateur Safari et lecteur d’écran restent à qualifier.
