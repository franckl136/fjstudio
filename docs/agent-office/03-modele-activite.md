# Activité et identité

## Ce que désigne un personnage

Une identité Studio associe projet, runner et rôle. Une identité Codex est une session du dossier autorisé. Deux sessions de même surnom gardent leur identifiant propre. Les PR Cursor sont regroupées par projet et identifiant de session. La fiche conserve chaque PR et la date du dernier relevé.

| Source et observation | Position | Lecture |
| --- | --- | --- |
| Contact frais du runner sans tentative en cours | Café | Disponible à l'accueil |
| Tentative active et bail valide | Bureau | Préparation |
| Vérification active | Contrôle | Vérification attribuée |
| Tâche de synthèse active | Réunion | Synthèse en cours ; la présence de collègues dépend de leurs propres affectations |
| Dernier contact expiré, même si le bail court encore | Hors scène | Le bail et les preuves restent consultables |
| Inscription jamais vue | Hors scène | Présence inconnue |
| Signal de travail récent de Codex | Bureau | Activité du journal local, sans inférer une mission Studio |
| Fin de tour ou signal Codex ancien ou inconnu | Hors scène | Session terminée ou état inconnu |
| Lien de PR Cursor | Hors scène | Activité inconnue pour une PR ouverte ; historique lorsque toutes les PR associées sont closes ou fusionnées |

L'affectation au café signifie disponibilité. Le Studio ne dispose ici d’aucune observation de pause. La valeur « Non renseigné » préserve cette distinction.

## Lecture des compteurs

« Connectés au Studio » compte les postes dont le contact est frais. Les délais viennent du lecteur de contacts (30 secondes pour Control, 20 secondes pour A1). Le résultat de fraîcheur est transmis à la vue par une propriété interne qui ne change pas les réponses JSON existantes. « En mission Studio » compte les postes portant au moins un bail valide. Un poste peut être à la fois enregistré avec un bail et avoir perdu sa connexion.

Les compteurs d’onglets comptent uniquement les occupants représentés dans chaque pièce. Les sessions externes ne sont jamais ajoutées au nombre de connexions Studio. Les sessions historiques regroupent les tours Codex terminés et les sessions Cursor dont toutes les PR sont closes. Les états inconnus comprennent les postes jamais vus et les observations externes non concluantes. Chaque valeur s’applique aux projets autorisés et au filtre actif.

## Ambiance et relecture

Les figurants existent dans le navigateur. Leur compteur indique le nombre de personnages synthétiques dans la vue. Les tentatives terminées d’une synthèse Control peuvent être relues depuis l’historique de mission. Les passages et la relecture ne modifient ni les compteurs opérationnels, ni les baux, ni les missions.
