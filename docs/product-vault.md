# Coffre de sauvegarde hors ligne

Le coffre contient une paire PostgreSQL du Studio, chiffrée et authentifiée par AES-256-GCM. Il peut être conservé sur un deuxième disque physique local. La commande utilise Node.js et les mécanismes NTFS de Windows. Les opérations de chiffrement et de récupération peuvent s’exécuter sans PostgreSQL, Docker ni réseau.

## Préparer la clé une seule fois

Créer la clé depuis le checkout utilisé pour la sauvegarde.

```powershell
Set-Location D:\DEV\FjStudio-Product
npm.cmd run vault:key
```

La commande crée `.env.archive.local` avec 32 octets aléatoires. Elle refuse de remplacer un fichier existant. L’identité Windows du Studio, SYSTEM et les administrateurs disposent des autorisations sur la clé. À la lecture, l’outil vérifie le propriétaire et les autorisations effectives. La clé d’archive est indépendante de la clé maître du second facteur.

La récupération exige la clé qui a servi à chiffrer le coffre. Prévoir une copie de secours privée de cette clé dans un emplacement distinct du disque qui contient le coffre. Perdre toutes les copies de la clé rend les coffres correspondants irrécupérables. Conserver l’ancienne clé lorsque de nouvelles archives sont produites avec une autre clé. L’outil ne journalise aucune valeur de clé.

## Chiffrer une paire

L’exemple utilise un dump existant et son manifeste v2. Adapter le nom du dump et choisir un chemin de coffre encore disponible sur le volume local voulu. Le dossier parent doit déjà exister.

```powershell
$dump = 'backups\product-qualification-20261125232833747.dump'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')
$vault = "backups\product-$stamp.fjvault"
npm.cmd run vault:pack -- $dump $vault
```

Avant publication, le Studio vérifie le format PostgreSQL, le manifeste, la taille et le SHA-256 du dump. Pendant le chiffrement, il recalcule l’empreinte sur les octets effectivement transmis au chiffreur. Substituer un fichier de sortie existant provoque un refus. Les métadonnées du manifeste et le nom du dump sont eux aussi chiffrés. La taille du coffre demeure visible sur le support.

Après une copie vers un autre disque, comparer les SHA-256 du coffre source et de la copie avec `Get-FileHash -Algorithm SHA256 -LiteralPath <chemin>`. Pour éprouver la copie chiffrée, utiliser celle-ci comme source dans la commande de récupération.

## Récupérer une paire

Choisir un nouveau nom de dossier sur un volume NTFS local. Son parent doit exister, y compris lorsque la source chiffrée est sur un autre disque.

```powershell
$recovery = "backups\recovered-$stamp"
npm.cmd run vault:unpack -- $vault $recovery
```

Le Studio authentifie le contenu complet dans un répertoire NTFS temporaire privé. Il vérifie ensuite le nom du fichier, la structure du manifeste, le format et l’empreinte du dump. Le dossier final apparaît par renommage exclusif après ces contrôles. Une erreur d’authentification, une archive endommagée ou une collision conserve une destination existante. Un arrêt normal, y compris après un échec, nettoie le répertoire temporaire. Un arrêt brutal du système peut laisser un répertoire privé `.fjstudio-backup-…` sur le disque de récupération.

Le dossier final contient le dump et son manifeste avec leurs noms et octets d’origine. La sortie indique le nom de fichier, la taille et le SHA-256 du dump. Prévoir sur le volume de récupération environ deux fois la taille du dump pour le travail temporaire.

Ces commandes vérifient le dump et restaurent PostgreSQL dans une nouvelle base locale.

```powershell
$restoredDump = Join-Path $recovery (Split-Path -Leaf $dump)
npm.cmd run backup:verify -- $restoredDump
$database = 'fjstudio_a1_restore_' + [Guid]::NewGuid().ToString('N')
npm.cmd run restore -- $restoredDump $database
```

Le reçu SQL de restauration est produit par la dernière commande. Après chaque commande, vérifier son code de sortie avant de poursuivre. Les rôles, les clés de configuration nécessaires au fonctionnement du Studio et la quarantaine de reprise sont documentés dans le [guide de restauration](product-recovery.md).

## Format et contrôles

Le format v1 commence par huit octets ASCII `FJVAULT1` et un nonce aléatoire de 12 octets produit à chaque chiffrement. Cet en-tête est authentifié comme donnée associée. Le contenu chiffré est formé de la longueur du manifeste sur quatre octets big-endian, de ses octets UTF-8 d’origine et du dump, suivi sur disque d’un tag GCM de 16 octets. Le manifeste est limité à 256 Kio et la charge utile à 64 Gio moins 32 octets par coffre. L’outil lit les données du dump par blocs.

Les tests Windows couvrent un aller-retour avec comparaison des deux fichiers octet pour octet, la confidentialité de la clé dans les sorties, les ACL de la clé et des fichiers récupérés, le changement de clé, l’altération du nonce, du contenu ou du tag, la troncature, les jonctions et noms Windows invalides. Ils exercent aussi deux publications concurrentes et la protection d’un dossier existant, vide ou occupé.
