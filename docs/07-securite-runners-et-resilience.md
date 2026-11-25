# Sécurité, runners, permissions et résilience

Proposition du 25 novembre 2026. Les contrôles sont des critères de conception, à vérifier sur les installations réelles.

## Périmètres d'autorisation

La politique vérifie le projet, l'acteur, l'action, la cible, la classification de données, l'environnement, l'empreinte du plan et la version des autorisations. Un délégué ne peut élargir la portée reçue. L'agent possède une identité pour l'audit. La capacité d'agir provient d'une attribution spécifique. Les droits courants ont priorité sur l'enveloppe historique. Une suppression d'accès empêche les prochaines remises et transmissions. Une émission externe déjà partie est réconciliée et déclarée.

| Frontière | Garde prioritaire | Vérification requise |
|---|---|---|
| Navigateur → API | MFA obligatoire avec inscription fermée, contrôle de projet et réauthentification pour les décisions sensibles | Lecteur, opérateur, approbateur, exploitant et compte révoqué. Aucun ID de projet fourni par le client ne vaut autorisation |
| API et base | RLS, références composites, rôles de migration, exploitation, lecture et sauvegarde distincts | Connexion mutualisée, requêtes asynchrones et réutilisation de contexte après erreur |
| Runner → API | Identité unique révocable, liaison projet et capacité, bail avec génération | Renouvellement refusé sur révocation, fin tardive conservée au besoin comme observation, aucun effet métier tardif |
| VM → environnement | Pas de socket hôte, clés ni domicile. Utilisateur non privilégié, limites de calcul et disque, environnement jetable | Sortie réseau, ressources, arrêt après veille et effacement du contexte entre projets |
| Moteur → outil | Demande via courtier, paramètres bornés, règle d'effet et destination vérifiées par le Studio | Ordre provenant d'un document ou d'un autre agent incapable d'accorder une permission |
| Studio → GitHub | Lecture seule au MVP, signatures et installations, droits par dépôt | Projection et déduplication, révocation d'installation et collecte partielle visible |
| Déploiement | Action humaine dans la chaîne réceptrice qui détient les autorisations | Démonstration sur le forfait et parcours réel. Afficher précisément le niveau de protection démontré |
| Sauvegarde → stockage | Chiffrement, identité dédiée, contrôle des points actifs et indépendance des accès de secours | Un hôte vierge, un exploitant désigné, un secret de secours conservé hors VPS |

L'enrôlement des runners est à usage unique. Le superviseur reçoit un jeton propre et limite son exposition au processus de confiance. Les appels du candidat n'héritent d'aucun identifiant. Le VPN est facultatif. Le MVP utilise du polling HTTPS sortant, sans port ouvert sur le réseau local. Le VPS traite des actions de confiance. Le PC utilise de préférence une VM isolée avec conteneurs internes si utiles. Un conteneur rootless réduit certains privilèges, mais partage des composants de l'hôte. L'isolation effective reste à tester selon OS et hyperviseur. [Docker rootless](https://docs.docker.com/engine/security/rootless/), [OWASP moindre privilège agentique](https://genai.owasp.org/agentic-applications-2026/asi02-tool-misuse-and-exploitation/)

## Annulation et perte de contrôle

Le superviseur mesure une limite locale conservative qui couvre un délai de retour et la marge d'arrêt. En veille, le processus de travail reste bloqué au réveil jusqu'à vérification de l'époque, du bail et des droits. Sur demande d'arrêt, bloquer les nouvelles admissions et terminer le groupe de processus ou l'environnement. Publier la preuve de fin disponible. Sans preuve d'arrêt, mettre en quarantaine le créneau et toute ressource exclusive. Une nouvelle exécution en environnement propre est possible pour une tâche isolée dont le contrat permet la répétition. L'état d'un service distant ne découle pas du résultat de l'arrêt local.

Un journal d'audit append-only pour les rôles applicatifs montre décisions, refus et acteur. Des copies hors hôte améliorent le contrôle de l'intégrité. Une compromission root peut affecter les événements, preuves et secrets détenus sur l'hôte. Les rapports qualité à fort impact peuvent exiger une preuve d'un second environnement de confiance.

## Sauvegarde et reprise

Viser deux points quotidiens, alerte à 18 h, rétention au moins 35 jours et huit points hebdomadaires. Faire un dump cohérent et capturer les artefacts immuables référencés par son manifeste. Stocker la clé Restic, les accès et la procédure hors du VPS. Restic sur SFTP sépare la cible du VPS. Un compte SFTP pouvant modifier le dépôt ne fournit aucune garantie append-only. Les snapshots Hetzner restent sur la même cible. Pour couvrir perte ou corruption de cette cible, conserver une copie critique indépendante selon décision d'exploitation. Borg fournit une alternative chiffrée à qualifier sur la version prise en charge. [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [Restic, dépôt distant](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [Hetzner SFTP et Borg](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg/)

1. Isoler l'ancien hôte et révoquer les expéditeurs susceptibles d'agir encore. Établir quels connecteurs distants ont pu recevoir des appels.
2. Restaurer base, manifestes et objets sur un VPS vierge. Démarrer dans une nouvelle époque, sans attribution ni sortie vers fournisseurs ou écriture GitHub.
3. Vérifier l'accès humain, les empreintes, le dernier point intègre et la lecture du dossier de mission. Importer les preuves distantes nécessaires au rapprochement.
4. Réconcilier effets et usage depuis l'heure du point restauré. Les actions dont le résultat demeure inconnu restent en attente. Autoriser explicitement les étapes sensibles à rouvrir.
5. Mesurer le RPO sur l'âge du point réellement utilisable. Mesurer le RTO jusqu'au service exploitable et publier séparément l'heure de reprise des effets sensibles.

Cibles du dossier maître de 24 h de RPO et de 4 h de RTO sur un volume représentatif, à prouver. La disponibilité 24/7 est un objectif d'exploitation. La panne d'un VPS unique demeure une interruption. La sonde hors hôte doit vérifier un signal minimisé et alerter sur sa disparition.
