# 04 — Fournisseurs et moteurs IA

**Folk & Joy Studio · Proposition de conception · 25 novembre 2026**

Le Studio doit conserver son état, ses décisions et les preuves indépendamment du moteur. L’exécution déterministe reste le parcours de référence à 0 € d’IA. Une première offre locale est proposée pour des missions simples sur le PC. L’API directe devient le premier chemin distant à qualifier lorsqu’un besoin, un budget et le traitement des données ont été approuvés. Les CLI restent utiles pour leur environnement de développement. Leur capacité à limiter et à attribuer chaque dépense doit être prouvée avant une délégation autonome.

## 1 · Contrats et frontières

| Composant | Entrée et résultat | Responsabilité |
|---|---|---|
| Profil d’agent | Identité, rôle, compétences et version | Définit un périmètre métier et le format des livrables attendus |
| Orchestrateur | Plan et contexte figés, version de politique, budget, délais | Admet ou refuse une étape, programme les successeurs, réessaie sous limites et possède l’état du plan |
| Adaptateur de moteur | Travail borné et capacités qualifiées. Événements, résultat typé, artefacts, état d’arrêt | Obtient un résultat dans l’enveloppe et expose son niveau d’observabilité. Une session native est une référence facultative |
| Connecteur de fournisseur | Requête d’inférence, modèle, schéma de sortie, bornes et référence logique | Traduction de protocole, comptage, estimation, envoi, normalisation des statuts et de l’usage |
| Passerelle IA | Appel autorisé par la politique et réservation du budget | Seul chemin des appels facturés automatiquement. Enregistre l’intention, conserve les identifiants de rapprochement et possède les clés d’API directes |
| Superviseur de runner | Tentative, bail, génération, manifeste et ressources | Impose les limites du processus qu’il contrôle et vérifie l’arrêt ou l’isolement |
| Courtier d’outils | Outil, paramètres, acteur, projet, classe de données, ressources et effet | Contrôle l’autorisation à chaque exécution. Les demandes du modèle restent des données |

**Principe d’homologation.** Une capacité est attribuée à un profil précis incluant moteur et version, fournisseur et modèle, compte, politique de données, endpoint, mode d’authentification, runner et OS. Même fournisseur et même famille de modèles ne suffisent pas à transférer une qualification. La combinaison contractuelle doit aussi identifier les fonctions facturables et celles qui ont été désactivées.

### Manifeste minimal d’une tentative

- ID de mission, étape et tentative. Génération et expiration du bail.
- Références d’identité et de compétence, version du plan et empreintes des entrées.
- Contrat de sortie, validation attendue, délai, nombre de tours et quota de contexte.
- Politique d’accès, outils admissibles, réseau et catégories de données qui peuvent sortir.
- Modèle et mode d’inférence admis, borne de coût, version tarifaire et plafond restant.
- Références des checkpoints et artefacts vérifiés disponibles. Les références de session tierces ont une provenance et une expiration séparées.

Le moteur émet les événements à travers une enveloppe qui distingue réception de la demande, démarrage confirmé, proposition d’outil, résultat candidat, usage provisoire, demande d’arrêt et résultat terminal. Les événements sont numérotés par flux. Un résultat final passe par une validation de schéma et un contrôle métier. Les sorties libres restent utilisables comme pièce jointe, sans produire une transition d’autorité.

### Capacité et degré de preuve

| Dimension | Ce que le profil doit déclarer |
|---|---|
| Contexte | Fenêtre, types d’entrées, mode de comptage et couverture observable. Distinguer texte transmis, sources accessibles aux outils et contexte ajouté par le fournisseur |
| Outils | Outils locaux supervisés ou outil serveur opaque. Validation des paramètres, annulation et classe d’effet. Un outil opaque non conforme exclut le profil pour le cas concerné |
| Fin d’exécution | Séparer arrêt du flux, arrêt confirmé localement, requête d’annulation distante acceptée et fin distante confirmée |
| Coût | Borne réservable, attribution par appel logique, précision au rapprochement. Un quota d’abonnement partagé ne démontre pas un plafond par mission |
| Reprise | Possibilité de relire un résultat distant, de reprendre une session et de relancer un travail depuis le checkpoint Studio |
| Contrat de sortie | Schéma validable, taille bornée et garanties de la plateforme. Vérifier les refus et les fins tronquées |
| Données et licence | Destination, rétention, usage aux fins d’amélioration, sous-traitants ou régions si établis, droits d’accès, licence du moteur et des poids lorsque concernés |

Un profil ne peut être admis dans une mission exigeant inspection exhaustive que si le périmètre de l’inspection est vérifiable. Le Studio peut afficher exactement ce qu’il envoie. La visibilité sur les éléments ajoutés côté moteur ou fournisseur peut être partielle. Il ne faut pas placer un secret ou un identifiant de production dans le contexte en comptant sur le filtrage du modèle.

## 2 · Comparaison opérationnelle

Les faits de cette section sont vérifiés dans des documentations publiques. Aucun compte, accès, modèle, OS ou forfait du propriétaire n’a été testé.

| Chemin | Atouts et base documentaire | Conditions et exposition | Décision proposée |
|---|---|---|---|
| OpenAI Responses API | Interface directe. Suivi et annulation distante pour une réponse compatible en arrière-plan. Contrôles de données et projets API documentés | Le mode asynchrone et la conservation dépendent des options et du compte. Vérifier la page de contrôle des données pour le mode retenu. Une déconnexion du flux ne confirme ni fin ni coût nul. Tarifs de l’API indépendants du forfait ChatGPT, sous réserve de crédits documentés pour certains comptes | Premier pilote cloud à sortie typée et outils hébergés désactivés. Autoriser le mode asynchrone uniquement après examen des données. [Responses en arrière-plan](https://developers.openai.com/api/docs/guides/background), [contrôles OpenAI](https://developers.openai.com/api/docs/guides/your-data), [facturation séparée](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform), [crédits éligibles](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions) |
| Codex CLI, SDK et app-server | CLI non interactif et SDK pour opérations bornées. App-server pour événements, approbations et interruption. Le dépôt Codex indique Apache-2.0 | La licence du dépôt n’accorde aucun usage d’un service hébergé. Vérifier les droits du compte ou de la clé. La reprise d’un fil ne rétablit pas les artefacts ni l’issue d’une action. Les mises à jour du protocole exigent une recette | Adaptateur optionnel. Démarrer par la surface la plus petite adaptée au besoin. Disponibilité et droits du compte à vérifier avant homologation. [Codex comme plateforme](https://developers.openai.com/blog/codex-as-a-platform), [dépôt et licence](https://github.com/openai/codex), [authentification](https://developers.openai.com/codex/auth) |
| Cursor CLI et ACP | Headless avec flux structuré. Clé Cursor utilisateur ou connexion selon le mode. ACP documente le transport, des événements, des permissions et l’annulation de session | Usage sous conditions Cursor. Les forfaits récents et historiques ont des modes distincts de mutualisation et de paiement. Le compte réel peut partager son pool avec d’autres surfaces. Une demande d’arrêt ACP ne valide pas l’arrêt d’un sous-processus ni le coût | Import de résultat humain au lancement. Pilote PC sous supervision seulement si arrêt, attribution d’usage, droits et contrôle de sortie sont qualifiés. [Headless](https://cursor.com/docs/cli/headless), [ACP](https://cursor.com/docs/cli/acp), [authentification](https://cursor.com/docs/cli/reference/authentication), [offres et pools](https://cursor.com/docs/models-and-pricing), [conditions Cursor](https://cursor.com/terms-of-service) |
| Anthropic Messages API et Claude Code/Agent SDK | API Messages avec flux et mesures d’usage. Claude Code documente mode non interactif et reprise de session et expose des mesures estimées | Conditions du service. L’usage d’un OAuth grand public dans un produit tiers est encadré. Préférer une clé API dédiée et qualifier les conditions de l’intégration. La sortie du CLI et les chiffres de coût ne prouvent pas la facture définitive, en particulier après reprise de session | API directe si le différentiel de qualité est démontré. CLI facultatif dans une VM, sans accès production. [Flux Messages](https://platform.claude.com/docs/en/build-with-claude/streaming), [mode programmatique](https://code.claude.com/docs/en/headless), [conditions d’intégration](https://code.claude.com/docs/en/legal-and-compliance) |
| Gemini Developer API | API directe avec flux et niveaux gratuits ou payants selon le modèle et l’accès | Les conditions d’usage des données comportent des dispositions spécifiques à certaines juridictions, dont l’EEE. Une offre gratuite ne prouve ni résidence du traitement ni continuité de service. Un mode gratuit doit être qualifié sans conversion automatique | Candidat de secours pour des sorties bornées. Tarifs, compte et données à qualifier séparément. [Tarification Gemini](https://ai.google.dev/gemini-api/docs/pricing), [facturation](https://ai.google.dev/gemini-api/docs/billing), [conditions](https://ai.google.dev/gemini-api/docs/terms), [diffusion en continu](https://ai.google.dev/gemini-api/docs/streaming) |
| Ollama | Inférence locale avec cloud désactivable. MIT pour le code Ollama. API native ou compatibilité OpenAI selon les fonctions utilisées | L’exécution strictement locale épargne la facture d’API, avec consommation électrique et occupation du PC. Vérifier la licence et l’origine des poids. Une API au format OpenAI ne garantit pas la même sémantique de toutes les fonctions. Qualifier l’arrêt du calcul au niveau du daemon, ou réserver un processus isolé à la tentative si cela est nécessaire pour l’arrêter | Premier pilote IA, borné à un modèle et un runner. Vérifier absence de sortie réseau et arrêter proprement le traitement en cas de coupure. [FAQ locale](https://docs.ollama.com/faq), [compatibilité](https://docs.ollama.com/api/openai-compatibility), [licence MIT](https://github.com/ollama/ollama/blob/main/LICENSE) |
| llama.cpp | Serveur et inférence locale. MIT pour le code, réglages plus fins de l’environnement et du modèle | Qualification matérielle et exploitation plus manuelles. Licence des poids distincte. L’API compatible doit passer la même suite de tests | Solution de remplacement locale si une mesure de RAM, de latence ou de portabilité le justifie. L’exemple Qwen3-8B est affiché sous Apache-2.0. Vérifier la variante et le distributeur de la quantification. [llama.cpp](https://github.com/ggml-org/llama.cpp), [licence](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE), [carte de modèle Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) |
| LiteLLM Proxy | Normalisation de multiples API, clés virtuelles et budgets proxy documentés | Processus et chemin supplémentaires, version et licence à examiner. Le dépôt sépare une licence MIT et des répertoires sous licence distincte. Les budgets proxy ne remplacent pas les réservations multiples et la traçabilité des effets du Studio | Reporter jusqu’à ce que la maintenance de plusieurs adaptateurs soit un coût mesurable. Qualifier les fonctions et zones qui resteraient opaques à travers le proxy. [Clés et budgets](https://docs.litellm.ai/docs/proxy/virtual_keys), [licence](https://github.com/BerriAI/litellm/blob/main/LICENSE) |

### Ordres de grandeur de facturation

Exemple **simulé** pour un appel texte standard de 100 000 jetons en entrée et 20 000 en sortie. Prix en USD, hors remise, cache, outils, taxes ou conversion. Les jetons facturés par un modèle en production ne sont pas déduits de cet exemple. La qualité requise et le nombre de tours peuvent dominer le prix par jeton.

| Référence publique vérifiée | Entrée / sortie par million | Coût simulé |
|---|---:|---:|
| GPT-5.4 mini | 0,75 $ / 4,50 $ | 0,165 $ |
| Gemini 3.1 Flash-Lite, texte standard | 0,25 $ / 1,50 $ | 0,055 $ |
| Claude Haiku 4.5 | 1,00 $ / 5,00 $ | 0,20 $ |
| Claude Sonnet 4.6, exemple de comparaison | 3,00 $ / 15,00 $ | 0,60 $ |

Le cas Sonnet 4.6 sert à reproduire l'exemple du dossier maître. Anthropic l'identifie comme modèle ancien dans son catalogue. Pour une nouvelle qualification, relever le prix et les capacités du modèle effectivement retenu. Les versions, les suites de tests et les politiques suivent les changements de catalogue. [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Gemini](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [fiche Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview)

## 3 · Engagement, réconciliation et remplacement

**Réservation.** Un egress facturable exige une intention persistante et une réservation atomique couvrant les portées applicables. Figer devise, grille, bornes de jetons, service et version du compteur. Désactiver au lancement les outils hébergés ou modalités dont le coût maximal n’est pas borné. Calculer le coût à partir du contrat effectif, y compris les jetons de raisonnement facturables et les surcoûts de fenêtre s’ils s’appliquent. Décider en transaction. Vérifier à nouveau droits et génération avant le départ. Les plafonds fournisseur et l’absence de recharge automatique complètent le contrôle Studio.

**Phases d’un envoi.** Intention durable, envoi autorisé, reçu éventuel, usage préliminaire, rapprochement. La fenêtre entre sortie réseau et persistance du reçu n’est pas atomique. Si le reçu est inconnu après une coupure, maintenir la réserve et interroger les données d’usage ou de résultat disponibles. Référencer séparément ID logique interne, tentative d’appel et ID distant. N’utiliser un rejeu avec la même clé que si le fournisseur documente sa portée, sa durée et son comportement pour ce mode d’appel. Afficher un écart non rapproché et suspendre les nouveaux appels du périmètre quand la borne n’est plus démontrable.

**Bascule de moteur.** L’orchestrateur construit le nouvel appel à partir d’un checkpoint Studio et d’un paquet de données versionné. Le routeur élimine les profils qui ne satisfont pas les permissions, la confidentialité, la qualité minimale, l’observabilité et les bornes de coût requises. Il classe les choix admissibles avec une politique stable et des observations datées. La sortie garde l’identité de l’agent et reçoit une nouvelle tentative. Toute modification de destinataire ou de portée hors enveloppe revient à l’approbation. La reprise échoue de manière explicite si l’étape exige un outil spécifique ou un contenu confidentiel indisponible avec la nouvelle route.

**Checkpoint portable.** Conserver plan et étape, entrée canonique avec empreintes et classification, artefacts validés et versions de schémas, contrôles acquis, état des effets externes et réservations. Lors d’une bascule, revalider accès et contexte, puis ignorer les sorties non vérifiées et les états natifs qui ne se traduisent pas en preuves. Une session tierce référencée facilite la reprise sur le même environnement tant que les autorisations restent valides.

### Scénarios de décision

| Incident | Résolution proposée |
|---|---|
| Rejet explicite avant exécution, avec preuve de non-facturation | Libérer la réserve si le contrat le permet, puis classer l’erreur. Une nouvelle route doit rester dans l’enveloppe |
| Quota temporaire ou saturation | Attendre avec échéance et plafonner les tentatives. Une alternative qualifiée peut être retenue si du budget est disponible |
| Timeout après émission | Garder la réserve. Réconcilier d’abord. Pour un calcul pur, une deuxième consommation bornée et approuvée peut être engagée comme nouvelle tentative. Une écriture externe incertaine ne se rejoue pas |
| Annulation locale ou réponse tronquée | Distinguer demande, arrêt et consommation. Un résultat tronqué ne gagne aucune validation de sortie. Rapprocher même lorsque la tentative est abandonnée |
| Version, mode tarifaire ou conditions changés | Suspendre les capacités invalidées. Préserver les versions historiques et relancer l’homologation du profil ou préparer une route admissible |

## 4 · Homologation et étapes d’adoption

1. **A1 sans modèle.** La même mission produit ses preuves sur chemins manuel et déterministe. Modifier ou retirer les profils IA ne bloque pas sa clôture.
2. **Pilote local.** Qualifier un runner, un modèle épinglé et trois tâches bornées. Mesurer mémoire, délai, stabilité du schéma et taux de contrôle réussi. Vérifier l’absence de sortie réseau et les capacités sous pression mémoire et perte de bail.
3. **Pilote API.** Autorisation explicite préalable. Tester avec données synthétiques, une grille datée, une clé dédiée, sans outil externe et un budget strict. Réconcilier commande, événements et relevé de l’API.
4. **Route de secours.** Vérifier les mêmes entrées et seuils sur un second profil. Simuler indisponibilité et incompatibilité. Le test doit aussi réussir lorsque le comportement attendu est l’attente.
5. **CLI facultatif.** Tester version, transport, arrêt effectif, processus survivants, réseau, contrôle des outils, provenance et facturation. Pour un profil de CLI opaque, réserver l’usage autonome aux enveloppes dont chaque limite reste démontrable. Sinon, accepter un résultat importé d’une exécution humaine.

La suite de recette doit aussi couvrir un arrêt avec réponse distante encore facturable, un renouvellement de politique en cours d’exécution, un changement de modèle alias, un refus de sortie structurée et une réserve tardivement facturée. Comparer les profils sur la réussite des contrôles métier, le coût total par résultat acceptable, le temps de production et l’effort de reprise. **Les capacités, tarifs et licences décrits ici sont documentaires. Les scénarios et coûts sont des simulations. Les qualifications demeurent à exécuter après autorisation.**
