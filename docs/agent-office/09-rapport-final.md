# Agent Office 2.0 · Rapport de qualification

**Statut produit : terminé avec réserves, qualifié en environnement isolé.** La candidate est disponible sur la branche de développement. Le Studio quotidien continue d’utiliser son interface précédente sur le port 3041. Sa mise à niveau constitue une décision de déploiement distincte.

## État initial et conception

| Point du mandat | Statut | Résultat |
| --- | --- | --- |
| 1. État initial | Terminé et testé | Quatre pièces et un moteur de scène existaient. Les sessions externes terminées ou d’activité inconnue pouvaient occuper le café. Le [rapport d’audit](00-audit-existant.md) décrit les sources et les observations datées. |
| 2. Référence | Terminé et testé | Base vérifiée `c12c66b`, version officielle 0.4.0-rc.5. `2b7db58` appartient à l’historique. Les modifications locales Codex et Cursor ont été préservées et reprises sur la branche dédiée. |
| 3. Branche | Terminé et testé | `feat/agent-office-2`, worktree distinct de la maturation et des projets connectés. |
| 4. Architecture existante | Terminé et testé | Contacts PostgreSQL, tentatives et baux, lecteurs de sessions, rendu HTML et caméra isométrique. |
| 5. Architecture retenue | Terminé et testé | Une projection de population alimente les compteurs, les pièces et l’annuaire. Le moteur navigateur gère les effets, la navigation et la simulation. [Architecture](01-architecture-cible.md) |
| 6. Direction artistique | Terminé avec réserves | Matières, mobilier et atlas existants conservés, seuil commun et repères à l’échelle des salles, silhouette et gestes enrichis. L’appréciation artistique reste à valider par l’utilisateur. [Direction artistique](02-direction-artistique.md) |

## Produit réalisé

| Point du mandat | Statut | Résultat |
| --- | --- | --- |
| 7. Moteur visuel | Terminé et testé | Décor Canvas, sprites indépendants et liens DOM. Cadence bornée, réduction des mouvements et suspension en arrière-plan. |
| 8. Sprites | Terminé et testé | Apparence stable par identité, combinaisons de teints, coiffures et vêtements. Matrice de 24 × 33 pixels. |
| 9. Animations | Terminé avec réserves | Marche, travail et repos qualifiés en scénario. Le moteur décline aussi la lecture, la réflexion, la discussion, la présentation et l’intervention. La recette ne juge pas individuellement chaque variante graphique. |
| 10. Déplacements | Terminé et testé | 100 places distinctes par pièce. Le test de géométrie vérifie 1 600 trajets, dont 1 200 intersalles. Les personnages peuvent brièvement se croiser dans les allées. [Moteur et limites](04-moteur-animation.md) |
| 11. Mode réel | Terminé et testé | Un contact récent, un bail valide et un signal local de travail ont des significations distinctes. Les états inconnus et les sessions historiques gardent une fiche hors scène. |
| 12. Mode ambiance | Terminé et testé | Quatre figurants synthétiques évoluent entre les pièces. La recette vérifie les métriques opérationnelles et les requêtes de lecture. |
| 13. Intégration des agents | Terminé avec réserves | Studio observe ses runners, Codex fournit des événements de sessions locales et Cursor apporte des associations avec des PR importées. Le direct Cursor nécessite une autre source autorisée. [Règles d’activité](03-modele-activite.md) |
| 14. Fiches agents | Terminé et testé | Identité, source, projet, état, date et historique selon disponibilité. Les liens ouvrent poste, projet, mission et preuves. |
| 15. Interactions | Terminé et testé | Sélection persistante, listes d’occupants, filtre par outil, navigation et inspection de quatre emplacements. Les repères décrivent la place du personnage dans la scène. [Interactions](05-interactions.md) |
| 16. Plein écran | Terminé et testé | Entrée et sortie de la Fullscreen API, zoom, panoramique, recentrage et sélection d’une pièce. |
| 17. Responsive | Terminé avec réserves | Vues desktop 1440 × 900 et 1920 × 1080, petit écran tactile émulé 390 × 844. |
| 18. Accessibilité | Terminé avec réserves | Parcours clavier, focus, étiquettes, fiches natives, texte alternatif, mouvement réduit et repli sans JavaScript. Lecteur d’écran et appareil physique à qualifier. |

## Mesures, livraison et suite

| Point du mandat | Statut | Résultat |
| --- | --- | --- |
| 19. Performances | Terminé avec réserves | Jusqu’à 97 marcheurs pour 100 présences. À cette charge, 14,9 % du temps du thread de rendu sur l’échantillon Chrome headless. Les [mesures et leurs limites](06-performance.md) distinguent cette valeur de la consommation CPU du PC. |
| 20. Tests | Terminé avec réserves | Contrôle TypeScript, tests du dépôt avec PostgreSQL isolé, tests géométriques et parcours navigateur. Le parcours serveur a validé le lien entre un avatar, un vrai bail de recette et les trois checkpoints de la mission. Résultat détaillé ci-dessous. |
| 21. Captures | Terminé et testé | Avant/après, chaque pièce, fiche, plein écran, mobile, ambiance et [déplacement animé](captures/10-deplacement.webp). Toutes les images de recette utilisent l’atelier synthétique. [Galerie](07-recette.md) |
| 22. Documentation | Terminé | Les documents 00 à 08 couvrent l’audit, l’architecture, le rendu, les règles, les tests et le [guide utilisateur](08-guide-utilisateur.md). CHANGELOG mis à jour. |
| 23. Commits | Terminé | `98dc155` audit et reprise des composants locaux, `4a74b66` source Codex, `1be4b12` moteur et représentation, `65d9891` qualification et preuves visuelles. |
| 24. Push GitHub | Terminé et vérifié | La référence distante a été relue après le push sur [la branche publique autorisée](https://github.com/franckl136/fjstudio/tree/feat/agent-office-2). |
| 25. Limites | Terminé avec réserves | Disponibilité des journaux locaux et des relevés importés, absence de source de pause, croisements possibles, qualification sur Chrome desktop. |
| 26. Prochaine évolution | Non commencée | Recette d’usage par le propriétaire sur quelques missions représentatives, puis arbitrage sur l’activation locale. Le déploiement est soumis à son accord. |

### Résultat de la dernière passe

`npm run typecheck` réussi. `npm test` a recensé 115 tests, avec 114 réussites, zéro échec et un test ignoré. Ce dernier vérifie un rôle de catalogue Database Explorer et exige sa grappe dédiée sur le port 55453. Le Loft a utilisé une autre instance PostgreSQL de recette en boucle locale. Les scripts `product-workspace-browser.mjs`, `office-pixel-browser.mjs` et `office-2-browser.mjs` ont réussi. La version officielle du paquet reste 0.4.0-rc.5.
