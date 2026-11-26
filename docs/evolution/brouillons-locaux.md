# Saisies et brouillons sur cet appareil

## Quitter un formulaire de mission

La liste des missions avec leur statut précède le formulaire. **Créer une mission** mène directement à la saisie. Pour la création ou la révision d’une mission, le Studio compare les valeurs présentes aux valeurs initiales. Si vous changez de projet, d’espace ou de page après une modification, choisissez **Rester sur le formulaire** pour retrouver tous les champs ou **Abandonner et quitter** pour continuer. Si les valeurs sont intactes, la navigation est immédiate. Un échec d’envoi conserve les champs à l’écran et permet de réessayer. Pour une fermeture ou un rechargement, le navigateur peut afficher sa confirmation native.

La protection par défaut fonctionne en mémoire, y compris lorsque le stockage du navigateur est indisponible. Après une sortie confirmée, une nouvelle ouverture affiche les valeurs du serveur.

## Option de brouillons persistants à confirmer

Le candidat utilise la garde en mémoire par défaut. Le banc de recette active la persistance avec `STUDIO_LOCAL_DRAFTS=1` sur son propre serveur. Une activation du Studio quotidien relève d’une décision produit sur la conservation et la protection des saisies dans le profil du navigateur.

Avec cette option, dans la création de mission ou « Modifier le périmètre », le Studio enregistre les champs modifiés sur cet appareil après une courte pause dans la saisie. Attendre **Enregistré sur cet appareil** avant de fermer le navigateur. Au retour dans le même projet avec le même compte, choisir **Reprendre** au-dessus du formulaire. Plusieurs saisies peuvent coexister. Chaque entrée porte son objectif et sa dernière date d’enregistrement. Une nouvelle saisie garde son propre identifiant.

La finalité du dossier, ses champs spécifiques, les champs communs et les valeurs saisies dans d’autres finalités sont conservés. La reprise d’une révision ancienne invite à comparer le contrat actuel. L’opérateur peut ensuite choisir d’utiliser la révision affichée. La mission est créée exclusivement avec **Créer la mission en brouillon**. L’envoi réussi retire la saisie locale correspondante. Dans la Control Room, la liste des missions précède le formulaire, accessible par le raccourci **Créer une mission**.

Avec la persistance activée, **Enregistrer et continuer** complète les choix de sortie, y compris après une autosauvegarde. **Abandonner et quitter** efface le brouillon courant. Une suppression en conflit ou en échec conserve le formulaire à l’écran. Pour une fermeture, un rechargement ou une navigation pilotée par le navigateur, la protection repose sur l’avertissement natif lorsque le navigateur l’autorise. Un arrêt forcé avant confirmation peut perdre les toutes dernières frappes. Une saisie déjà enregistrée reste proposée au retour.

En cas de panne, le statut signale l’échec et propose une nouvelle tentative. Une modification concurrente d’un autre onglet ou une suppression empêche l’écrasement. L’auteur peut conserver sa saisie dans **une copie séparée**. L’abandon d’un brouillon depuis la liste demande confirmation.

## Stockage et identité

- IndexedDB conserve les brouillons dans le profil du navigateur, pour l’origine exacte du Studio, y compris son port. Utiliser la même origine, le même profil et le même compte après redémarrage. Le mode privé, l’effacement des données du site, une perte du profil ou le retrait des données par le navigateur peuvent supprimer ces brouillons.
- Les valeurs, l’objectif, les variantes et la clé d’idempotence de la commande sont chiffrés avec AES-256-GCM via Web Crypto. Le serveur dérive une clé HMAC pour le compte, le projet et le formulaire depuis la clé locale d’identité ou, dans l’ancien mode, la clé de l’opérateur. Il faut une session active, le droit d’opérer sur le projet et une requête de même origine pour obtenir cette clé. La clé de périmètre vit en mémoire pendant l’opération. La clé maître reste sur le serveur.
- La clé IndexedDB associe un identifiant opaque de périmètre et un UUID de saisie. La date, le numéro de révision, le vecteur aléatoire de 96 bits et le contenu chiffré complètent la ligne. AES-GCM authentifie le périmètre, l’UUID et la révision. Un changement de clé maître rend les brouillons existants illisibles. Un profil de navigateur administré ou compromis reste une limite du modèle local.
- Les écritures et suppressions vérifient la révision dans une transaction IndexedDB. Un onglet obsolète doit résoudre le conflit ou enregistrer une autre copie. La sauvegarde concerne uniquement la saisie locale. Les archives PostgreSQL du Studio couvrent les missions soumises. Une conservation de ces archives ne sauvegarde pas le profil du navigateur.
- Aucune expiration automatique des saisies inachevées. La suppression relève d’un abandon explicite, d’une soumission réussie ou de la politique de stockage du navigateur.

## Intégration

Le module `src/form-guard.js` protège la sortie et confirme la soumission du formulaire. Lorsque la persistance est activée, `src/form-drafts.js` ajoute le catalogue, le chiffrement et l’accès transactionnel. L’URL de clé est fermée lorsque l’option est désactivée. Les formulaires déclarent les noms de champs autorisés dans `data-draft-fields`, le compte rendu par le serveur et l’URL de clé du formulaire. Les événements DOM `draft-collect` et `draft-restore` incluent les variantes dynamiques de la Control Room. Une soumission conserve sa clé d’idempotence dans le brouillon et le serveur vérifie la cohérence du compte affiché.

Les deux intégrations livrées concernent la création de mission et la modification de son périmètre. Un nouveau formulaire nécessite une liste de champs explicite, un périmètre de clé autorisé côté serveur, une soumission idempotente et une confirmation de réussite avant la suppression locale. Les formulaires de connexion, les secrets, les invitations et les confirmations d’opérations ne doivent pas être enrôlés. Aucune migration SQL n’est requise.

## Recette reproductible

Sur la configuration Windows de recette utilisant PostgreSQL en boucle locale sur le port 55453, exécuter `node --env-file=.env.local scripts/drafts-browser.mjs`. Le script crée une base jetable et un profil Chromium temporaire. Il contrôle d’abord la garde avec un accès IndexedDB refusé, trois destinations internes, un envoi en échec et une saisie revenue aux valeurs initiales. Il teste ensuite la persistance en activant l’option uniquement sur le serveur de recette. Il ferme et relance entièrement Chromium avec ce profil, puis contrôle les champs, les variantes, l’isolation des projets et des comptes, le rôle lecteur, la concurrence entre deux onglets, l’abandon, une panne d’écriture IndexedDB et la création/révision réellement demandée. Il vérifie aussi que l’autosauvegarde n’a créé aucune mission. En configuration par défaut, il mesure la position de la première mission et de son statut en 1440 × 900 et 390 × 844. Le chemin des captures sur données synthétiques est affiché à la fin.
