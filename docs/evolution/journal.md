# Consulter l’activité du Studio

Depuis le Command Center, **Tout le journal** ouvre l’activité du projet sélectionné ou de tous les projets autorisés. Le filtre **Prioritaires** agit sur le tableau du portefeuille. L’aperçu affiche sa propre portée et la période de 30 jours.

## Les faits marquants de l’accueil

Le Studio sélectionne jusqu’à cinq événements. Il retient la dernière transition représentative d’une mission et donne la priorité aux incidents et demandes d’approbation, puis aux missions démarrées ou achevées et aux validations. Pour une même fiche de connaissance, il retient sa dernière révision. Un seul relevé Git peut figurer dans l’aperçu. La date et le lien vers le projet ou sa preuve situent chaque fait.

Le journal détaillé conserve les événements chronologiques disponibles, notamment les relevés écartés de l’aperçu. Il s’appuie sur les historiques du Studio et, pour les règles Lab, sur leur état courant. Les sauvegardes globales apparaissent pour l’administrateur dans la vue globale. Les droits sur les projets et les sources révoquées sont respectés.

## Identifier la portée d’un contrôle

Un passage Quality Lab sur l’un des exemples intégrés porte la mention **Exemple synthétique du Studio**, y compris sur sa ligne du portefeuille et dans ses alertes. Un contrôle lancé sur une source configurée pour le projet porte la mention **Source autorisée du projet**. Le verdict se rapporte à la source et au profil testés. Le journal identifie aussi les missions A1 exécutées sur un cas synthétique.

## Filtrer et ouvrir une preuve

1. Choisir le projet, la famille d’événement et la période (1, 7, 30 ou 90 jours), puis **Appliquer**.
2. Lire la plage, le total et le numéro de page au-dessus des événements. **Première**, **Précédente**, **Suivante** et **Dernière** conservent les filtres. Une page affiche jusqu’à dix événements.
3. Ouvrir le titre de l’événement pour consulter la mission, le relevé Git, la révision ou la photographie correspondante. Le nom du projet ouvre sa fiche.
4. La source et l’heure figurent sous le titre. **Détails techniques** déplie l’auteur, les identifiants et, lorsqu’ils sont enregistrés, la branche et les empreintes complètes. Ces informations sont présentées de la même manière sur l’accueil.

Les liens fonctionnent en navigation HTML ordinaire. Avec JavaScript, la pagination remplace la liste, conserve l’adresse courante dans l’historique et place le focus sur le nouveau résultat. Changer de projet recharge également le menu de ce projet. Les résultats et le total d’une réponse sont calculés sur une même photographie PostgreSQL. De nouveaux événements peuvent modifier le contenu des pages lors d’une consultation ultérieure.
