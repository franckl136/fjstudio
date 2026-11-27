# Moteur de scène

Le décor possède un canevas de 1520 × 824 pour une grille logique de 760 × 412. Il est repeint à la création, au chargement des atlas ou sur un changement de décompte. Les personnages ont des canevas indépendants fixés à des liens DOM accessibles. La projection transforme les axes du sol en diagonales de 22 × 10 pixels par tuile. La profondeur des liens dépend de la hauteur des pieds à l’écran.

## Postures et cadence

Le moteur comprend idle, work, think, read, talk, screen, break, meeting et intervention. Deux phases de marche alternent pendant un trajet. Une pulsation commune anime jusqu’à 24 personnages immobiles par passage (limite ajustable sur le conteneur par data-animation-limit). Le lot tourne pour couvrir la population. La pulsation passe de 550 à 850 ms pour plus de quarante personnages. La boucle requestAnimationFrame sert aux déplacements en cours. L’onglet caché et le mode mouvement réduit arrêtent pulsation, déplacements et animations de décor ; une affectation reste affichée à sa destination.

## Déplacements et places

Chaque pièce conserve un masque de circulation de 35 × 27 points espacés d’un quart de tuile. Des empreintes rectangulaires excluent les meubles solides. Une recherche en largeur calcule un chemin cardinal dans la pièce ; le trajet change de pièce via les seuils et la jonction centrale. Les segments colinéaires sont réunis. Les places sont stabilisées par identité et attribuées sur des cases franchissables distinctes dans la limite de capacité du masque. Les trajectoires animées partagent les allées et le point central ; de brefs croisements sont possibles. La position en profondeur et la réduction de la taille des personnages au-delà de neuf par salle atténuent le recouvrement.

## Caméra

Les onglets ou cartels de pièce déclenchent une focalisation. Un deuxième zoom de 100 à 200 % peut être ajusté par pas de 25 %. Le cadrage se déplace par glisser sur le fond ou avec les flèches lorsque le plan a le focus. Recentrer revient au cadrage de la pièce sélectionnée ; Plan complet ramène aux quatre pièces. Les contrôles fonctionnent également en plein écran.

## Simulation isolée

Ambiance simulée monte quatre figurants distincts dans la couche loft-simulation. Ils effectuent en local une ronde déterministe entre les pièces, changent de posture et suivent les mêmes chemins que les personnages observés. Le mouvement réduit conserve le premier tableau et les contrôles. Les décomptes des onglets proviennent des figurants pendant la simulation. Revenir à Activité réelle supprime la couche de personnages fictifs et restaure les présences à partir du dernier relevé. Les commandes de simulation n’émettent aucun appel métier.

Quatre points d’inspection se superposent au mobilier du bureau et aux consoles. Leur numéro correspond au siège stable de la scène. Le panneau désigne le personnage placé à cet emplacement du loft et ouvre sa fiche. Une place libre affiche « Emplacement libre dans le loft ». Le numéro représente une position graphique. Les sources ne donnent aucun identifiant de machine physique. Les repères disparaissent en simulation. Les commandes répondent au clavier et disposent d’une cible étendue au toucher.

La marche calcule les positions au plus à 60 Hz, ou 30 Hz au-delà de quarante personnages, selon le temps effectivement écoulé. Le test office-paths.test.ts utilise le code de navigation du navigateur et contrôle cent places distinctes dans chacune des quatre salles. Il parcourt 1 600 trajets (1 200 entre pièces et 400 internes), vérifie les seuils et échantillonne chaque segment au huitième de tuile contre les empreintes solides. Cette recette couvre les collisions avec le mobilier ; les personnages peuvent momentanément se croiser dans un couloir.
