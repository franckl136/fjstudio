# Comptes de la recette locale

Le port 3040 utilise des comptes nominatifs. Les deux configurations privées sont créées par `npm run setup:local` et `npm run setup:identity`. Cette dernière conserve une clé préexistante. L’instance enregistre une empreinte de sa clé maîtresse. Un démarrage avec une autre clé ou l’ancien mode à jeton est refusé sur cette base.

## Première ouverture

Sur une instance locale configurée avec `STUDIO_LOCAL_ADMIN_PASSWORD_ONLY=1` dans le fichier privé `.env.human.local`, le premier compte `admin-local` utilise un mot de passe seul. Ouvrir l’accueil dans le navigateur utilisé pour commencer l’activation et choisir un mot de passe d’au moins 14 caractères. Si la tentative a expiré, saisir la clé obtenue avec `npm.cmd run --silent access:local` dans le dossier du Studio, puis choisir le mot de passe. Aux connexions suivantes, utiliser `admin-local` et ce mot de passe.

Cette option s’applique à l’activation du premier administrateur. Les comptes invités et les administrateurs déjà activés avec TOTP gardent leur second facteur. Le lien **Connexion pour les comptes avec authentificateur** leur ouvre le formulaire approprié. Retirer l’option bloque l’accès du compte créé par mot de passe seul, y compris ses sessions existantes. Prévoir un administrateur actif avec TOTP avant de revenir à la configuration standard.

### Configuration standard avec TOTP

Depuis le checkout du produit, exécuter `npm run access:local` dans un terminal personnel. Ouvrir la page d’accueil et choisir **Activer un compte local**. Saisir cette clé d’amorçage. Dans une application d’authentification configurée localement, ajouter la clé TOTP affichée à l’écran. Choisir un mot de passe d’au moins 14 caractères et confirmer le code temporel. Le compte créé s’appelle `admin-local`. La clé d’amorçage cesse de permettre cette opération dès la première activation. Les essais automatiques utilisent leurs propres bases et comptes temporaires.

Dans **Comptes locaux**, l’administrateur peut inviter un lecteur, un opérateur ou un autre administrateur dans ses projets, renouveler une invitation en attente, ajuster les projets autorisés et désactiver un compte. Les invitations expirent après 30 minutes, l’enrôlement après 10 minutes. Chaque session expire après huit heures et se ferme immédiatement à la désactivation du compte. Une modification de périmètre prend effet à la prochaine requête. Un administrateur ne peut pas s’attribuer un projet tiers en modifiant son compte.

| Identité | Opérations dans le périmètre autorisé |
| --- | --- |
| Lecteur | Consulter les projets, les missions et les preuves |
| Opérateur | Créer et piloter les missions, examiner les preuves, gérer les règles et arbitrer les propositions |
| Administrateur | Opérations d’un opérateur, projets, comptes et consultation de l’état des archives |
| Runner | Réclamer une attribution de son projet et rôle, renouveler son bail, soumettre un résultat vérifié |

Les mots de passe sont dérivés avec scrypt et un sel individuel. Les secrets TOTP sont chiffrés en AES-256-GCM avec une clé propre à l’instance. Seules les empreintes des cookies et invitations sont conservées. Le serveur contrôle l’origine des écritures par cookie, le rôle, le projet, l’horloge et le rejeu TOTP. Après cinq échecs, le compte est verrouillé cinq minutes. Une limite en mémoire borne les tentatives et les calculs simultanés. Le temps Windows et celui de l’authentificateur doivent être synchronisés.

Sous Windows, le compte courant, SYSTEM et les administrateurs ont accès aux fichiers privés. Conserver les deux fichiers de configuration à part des dumps dans une sauvegarde chiffrée sous le contrôle de l’administrateur. La clé TOTP maîtresse existante est nécessaire pour connecter les comptes après restauration. Le produit ne fournit pas de réinitialisation automatique en cas de perte de tous les facteurs administrateur.

Le cookie HttpOnly et SameSite=Strict est limité à cette utilisation HTTP sur loopback. Le réseau distant, TLS d’hébergement, les passkeys, la récupération de compte déléguée et la rotation de la clé maîtresse exigent une qualification distincte. L’audit des accès conserve les identifiants locaux, les décisions et les dates. Il exclut mots de passe, codes, clés et cookies.

Le test du calcul temporel reprend le vecteur SHA-1 à 59 secondes publié dans la [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238#appendix-B). La configuration scrypt utilise N = 32768, r = 8, p = 3. [Recommandations OWASP sur le stockage des mots de passe](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)
