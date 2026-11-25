# 06 — Fournisseurs IA, moteurs et stratégie de failover

**Folk & Joy Studio · Revue approfondie · 25 novembre 2026**

**Recommandation.** Lancer le Studio sans fournisseur IA, avec un parcours déterministe complet et un budget facturable de 0 €. Qualifier ensuite soit une API directe sous budget, soit un modèle local sur un runner isolé. Qualifier Cursor, Codex ou Claude Code comme moteurs optionnels de développement, après démonstration du confinement et de l’attribution des coûts. La disparition d’un moteur suspend uniquement les étapes qui requièrent ses capacités.

**Niveau de preuve.** Sources officielles consultées le 25 novembre 2026. « Documenté » signifie décrit par l’éditeur pour la surface indiquée. Les capacités des installations, des comptes, des quotas, des modèles réellement activés et des régions du Studio restent **non vérifiées**. Les scénarios de cette note sont des simulations et des recettes à exécuter. Aucun appel d’inférence, achat ou accès à un compte n’a été effectué pour cette revue.

## 1 · Frontières de l’intégration

| Entité | Autorité et contrat |
|---|---|
| Fournisseur et compte | Transport, authentification, conditions de traitement, résidence si démontrée, capacités de suivi, facturation et disponibilité. Le compte est une référence administrée, avec secret conservé hors des plans |
| Modèle | Identifiant et version ou alias, modalités, fenêtre, bornes de sortie, classes d’outils, paramètres de raisonnement, sortie structurée et grille tarifaire datée |
| Moteur | Traitement d’une étape par API seule, moteur local, CLI ou serveur de protocole. Déclare les événements et artefacts qu’il sait produire, l’arrêt et le mode de reprise qu’il sait prouver |
| Environnement d’exécution | Runner et profil approuvé, version, ressources, réseau, outils, mécanisme d’arrêt et accès aux fichiers. Aucun secret de production n’est confié à un processus candidat |
| Adaptateur | Transforme un contrat du Studio en requêtes du moteur. Normalise événements, erreurs, résultats et usage. La validation métier, les droits et la facturation restent des décisions Studio |
| Capacité qualifiée | Attestation versionnée de la combinaison moteur, interface, compte, modèle, région, OS et profil. Une capacité annoncée peut rester interdite avant recette |
| Agent | Identité versionnée, spécialité, compétences et historique. Une nouvelle tentative peut changer de moteur sans changer l’auteur métier ni perdre ses checkpoints |
| Session | Référence facultative du fournisseur ou de l’environnement local. Portée, durée, compatibilité, sensibilité et conditions de reprise explicites |
| Tentative | Identifiants projet, mission et étape, génération, bail, version du plan, profil, enveloppe et références des effets. Porte une référence distante éventuelle sans dépendance de l’état métier à cette référence |

### Manifeste portable

Le manifeste porte un objectif d’étape, une version du format de contexte, la provenance des entrées et leurs empreintes, les extraits autorisés et leur classification, un schéma de sortie, des critères de validation, les checkpoints admissibles et un profil d’outils. Il fixe aussi versions, temps, durée du bail, nombre de tours, budgets et destinataires autorisés. Le moteur peut produire un résultat candidat, une demande d’outil ou un état terminal. Le Studio valide le schéma et les preuves avant de faire avancer le plan.

Une lecture de fichier, une exécution terminal et une écriture sont des capacités d’outil bien distinctes. Par défaut, une API directe propose des appels d’outils côté client et le Studio décide de leur exécution. Des outils intégrés au fournisseur exigent une qualification et une autorisation séparées. Pour un CLI, les restrictions réelles relèvent de l’environnement isolé et de la politique du Studio. Un message du modèle ou du CLI ne peut accorder de nouveaux droits. L’inspection distingue le paquet effectivement envoyé, les données ultérieurement lisibles et le contexte ajouté par le moteur qui reste inobservable.

## 2 · Matrices de capacités

Les limites ci-dessous servent à la sélection initiale. La fenêtre d’un modèle peut inclure l’entrée, la sortie, les messages système et les définitions d’outils. Les valeurs de la fiche produit ne déterminent donc pas directement le volume utilisable par un plan. La capacité de raisonnement est un paramètre ou une propriété annoncée. Seule la recette sur résultats validés permet d’évaluer la qualité pour une tâche donnée.

| Interface et modèle de référence | Raisonnement et contexte documentés | Outils, fichiers et terminal | Format de sortie |
|---|---|---|---|
| OpenAI Responses, GPT‑5.4 mini | Modèle de raisonnement. Fenêtre 400 000, maximum de sortie publié 128 000 | Appels de fonctions côté client. Outils hébergés selon modèle et compte. Aucune lecture ou écriture du dépôt ni terminal local par défaut | Flux d’événements, fonctions typées et Structured Outputs selon le modèle. [Fiche GPT‑5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [outils Responses](https://developers.openai.com/api/docs/guides/tools) |
| Codex CLI, SDK, app-server | Modèle et plafond selon moteur et compte. Compaction possible. Contexte post-compaction à qualifier | Agent de développement avec fichiers et terminal selon sandbox et permissions. Le profil peut exiger la lecture seule | CLI et SDK exploitables pour événements structurés. App-server pour dialogue, approbations et événements. [Surfaces Codex](https://developers.openai.com/blog/codex-as-a-platform), [app-server](https://developers.openai.com/codex/app-server) |
| Anthropic Messages, Claude Sonnet 5.5 | Raisonnement adaptatif documenté. Fenêtre 1 million et maximum de sortie 128 000 | Outils client exécutés par le Studio. Outils serveur distincts, interdits par défaut dans le pilote. Aucun accès au dépôt local implicite | Flux Messages et sorties structurées selon combinaison. La raison de terminaison et les sorties tronquées restent à valider. [Fiche Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [flux Messages](https://platform.claude.com/docs/en/build-with-claude/streaming) |
| Claude Code, CLI et Agent SDK | Modèle, effort et fenêtre selon système et compte. Compaction et reprise natifs à qualifier | Fichiers, terminal, outils programmatiques et MCP selon permissions et sandbox. Qualification du runner obligatoire | CLI non interactif et formats JSON ou flux JSON documentés. Un schéma valide ne vaut pas validation métier. [Mode programmatique](https://code.claude.com/docs/en/headless), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) |
| Gemini Developer API, Gemini 3.1 Flash-Lite | Réflexion selon modèle. Limites d’entrée et sortie publiées à 1 048 576 et 65 536 | Function calling côté client. Outils hébergés séparés. Aucun terminal local implicite | Diffusion en continu et sortie structurée selon le modèle, à valider sur critères Studio. [Fiche Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [diffusion](https://ai.google.dev/gemini-api/docs/streaming) |
| Cursor CLI et ACP | Capacité dépendante du modèle, du mode de routage et du forfait. Le Studio ne déduit aucune borne d’une enveloppe d’abonnement | Fichiers, commandes et outils côté agent. ACP permet de recevoir des demandes de permission. L’environnement borne les droits effectifs | Headless et flux JSON. ACP par JSON-RPC sur processus local. Le format des résultats de travail reste à contrôler. [Headless](https://cursor.com/docs/cli/headless), [ACP](https://cursor.com/docs/cli/acp), [prix et modèles](https://cursor.com/docs/models-and-pricing) |
| Ollama local | Dépend du modèle, du contexte configuré et des ressources de la machine. Par défaut documenté à 4k sous 24 Gio de VRAM, avec réglage possible | Appels d’outils selon modèle et API. Fichiers et terminal uniquement via service ou exécuteur autorisé | Flux local, schémas selon API et modèle. Vérifier séparément la compatibilité au format OpenAI. [Contexte Ollama](https://docs.ollama.com/context-length), [compatibilité API](https://docs.ollama.com/api/openai-compatibility) |

| Interface | Session, streaming et reprise documentés | Annulation, disponibilité et restrictions à qualifier |
|---|---|---|
| OpenAI Responses | Flux. Référence distante et suivi en mode arrière-plan compatible. Le Studio conserve son contexte canonique | Demande d’annulation distante en mode arrière-plan. Fermer un flux ne prouve ni arrêt ni coût nul. Vérifier compte, mode de stockage et confidentialité. [Mode arrière-plan](https://developers.openai.com/api/docs/guides/background), [contrôles des données](https://developers.openai.com/api/docs/guides/your-data) |
| Codex CLI / SDK / app-server | Reprise de fil selon interface. Événements structurés et suivi des tours selon surface | App-server documente l’interruption. Arrêter localement et vérifier les processus et effets. Droits du compte et usage de l’API à contrôler séparément. [App-server](https://developers.openai.com/codex/app-server), [authentification](https://developers.openai.com/codex/auth) |
| Anthropic Messages | Flux SSE. Reconstruction avec contexte canonique porté par le client | En cas de flux interrompu, appliquer la stratégie de reprise documentée du modèle, sans présumer l’arrêt, la non-facturation ou une session distante durable. [Flux et récupération](https://platform.claude.com/docs/en/build-with-claude/streaming) |
| Claude Code CLI / SDK | Reprise de session et sorties en flux documentées | Mesures CLI estimées et potentiellement cumulées après reprise. Tester arrêt du processus et des outils. Conditions d’authentification encadrées pour un produit tiers. [CLI](https://code.claude.com/docs/en/headless), [conditions d’intégration](https://code.claude.com/docs/en/legal-and-compliance) |
| Gemini Developer API | Flux et états propres à l’interface utilisée. Reporter toute dépendance aux références de sessions | Pour le profil standard, arrêt distant et coût résiduel non prouvés par la seule déconnexion. Qualifier modèle, accès, rétention et conditions applicables. [Flux](https://ai.google.dev/gemini-api/docs/streaming), [conditions](https://ai.google.dev/gemini-api/docs/terms) |
| Cursor CLI / ACP | ACP expose ouverture ou chargement d’une session et événements. Mode headless pour scripts bornés | ACP expose une demande d’annulation. Vérifier résultat terminal, processus descendants, outils, données, facturation et droits du compte. [ACP](https://cursor.com/docs/cli/acp), [authentification](https://cursor.com/docs/cli/reference/authentication) |
| Ollama local | Flux et contexte reconstruits depuis le Studio. Pour une exécution offline, désactiver le cloud et contrôler le réseau | Vérifier l’arrêt au niveau de l’inférence ou isoler le processus par travail quand l’arrêt l’exige. Consommation de matériel et électricité à mesurer. [FAQ locale](https://docs.ollama.com/faq) |

### Alternatives et licence

- **llama.cpp** permet de choisir plus finement le serveur et la configuration locale au prix d’une exploitation plus manuelle. Ollama et llama.cpp publient leur code sous MIT, distinctement des conditions des poids. Une qualification de modèle doit relever la licence, l’origine et l’empreinte de la quantification. [Ollama](https://github.com/ollama/ollama/blob/main/LICENSE), [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE), [exemple de carte Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B)
- **LiteLLM Proxy** réduit potentiellement le nombre d’API à intégrer et documente clés virtuelles et budgets proxy. Il ajoute un service et une surface de données. Les fonctions du proxy ne remplacent pas l’autorisation métier, la réservation à quatre portées, la provenance des outils et le registre d’effets Studio. Réexaminer si la maintenance des adaptateurs devient un coût établi. Le dépôt distingue le code MIT et le périmètre sous licence d’entreprise. [Budgets et clés](https://docs.litellm.ai/docs/proxy/virtual_keys), [licence](https://github.com/BerriAI/litellm/blob/main/LICENSE)
- **Codex** publie le dépôt sous Apache-2.0. Les droits et tarifs des services d’inférence relèvent du mode d’accès et du compte. L’éligibilité du mode d’accès se vérifie par compte. Les accès OpenAI API et ChatGPT sont facturés séparément, avec crédits d’API distincts pour certains abonnements éligibles. [Dépôt Codex](https://github.com/openai/codex), [facturation OpenAI](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform), [crédits d’API](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)

## 3 · Choix de route et traitement de l’incertitude

1. Construire les besoins d’étape depuis le plan validé et l’état du projet. Vérifier les lectures et données sortantes sous la politique courante.
2. Exclure les routes dont version, compte, runner, disponibilité, format de sortie, outils, qualité mesurée ou inspection ne satisfont pas le besoin.
3. Vérifier destinataire, rétention, classe de données, restrictions de transfert et coût maximal par appel et par étape. Une route impliquant une nouvelle destination ou une dépense hors enveloppe exige une approbation distincte.
4. Vérifier fonctions et effets qui ont déjà été produits. Reconstituer depuis le dernier checkpoint Studio et retirer les éléments inutiles. Valider de nouveau schéma, empreintes, droits et référence du travail.
5. Classer les routes admissibles selon des règles stables. Créer une nouvelle tentative, réserver son budget et enregistrer l’intention avant l’émission. Aucune relance automatique d’une écriture externe incertaine.
6. Si aucune route admissible ne reste, afficher la raison et basculer vers une étape déterministe ou humaine uniquement si le plan permet un résultat équivalent.

| Événement | Décision de passage |
|---|---|
| Limitation de débit | Attendre sous délai et plafond de relance. Comparer avec une route de secours qualifiée |
| Quota, crédit épuisé ou clé révoquée | Refuser les nouveaux appels du profil. Aucun achat, changement de compte ni rechargement automatique |
| Alternative sans capacité ou interdite pour une classe de données | Maintenir l’attente. Un humain peut approuver un paquet réduit ou une nouvelle route, dans sa propre portée |
| Délai expiré après départ réseau | Conserver réservation et référence. Consulter l’usage ou la réponse distante. Une seconde tentative de calcul pur exige que les deux coûts puissent être couverts et que la politique l’autorise |
| Action externe expédiée avant coupure | Enregistrer l’incertitude et rapprocher auprès de la destination. Le changement de moteur ne change ni la clé logique de l’effet ni son besoin de réconciliation |
| Modèle alias ou grille modifiés | Invalider l’attestation affectée. Figer les versions anciennes dans l’historique. Réévaluer l’enveloppe et requalifier |

La fenêtre entre émission réseau et persistance du reçu reste incertaine. Utiliser une clé d’idempotence distante seulement quand l’éditeur en documente la portée, la durée et le comportement pour l’API concernée. Distinguer effet logique, tentative de transport et référence distante. Annulation locale, acceptation de demande d’arrêt et fin distante sont trois preuves différentes.

## 4 · Réservation, attribution et alertes

Pour chaque fenêtre active, le plafond borne la somme des montants rapprochés et exposés. La passerelle vérifie en une transaction les budgets global, projet, agent et mission. Elle verrouille les portées dans un ordre déterministe, refuse les fonds insuffisants, puis inscrit l’intention et une réservation atomique. Un appel sans prix maximal démontrable reste bloqué. La prise en compte des jetons de raisonnement, des outils, du stockage et des surcoûts dépend du contrat réel de l’API. Le premier pilote désactive les outils hébergés à coût variable.

Au départ, seuils d’avertissement proposés à 70 % et 90 %, suspension avant tout nouvel appel qui franchirait une limite. Séparer montant réservé, usage estimé, usage confirmé et écart du relevé. En fin d’appel, rapprocher puis libérer le reliquat. Sans preuve à la suite d’un timeout, maintenir la réserve et l’afficher. Un rappel de facture peut arriver après une clôture de fenêtre. Reprendre uniquement après rapprochement ou après décision autorisée documentant l’écart. Les plafonds avec blocage du fournisseur complètent cette protection, avec délai possible et périmètre propre au compte. Un abonnement ou un pool partagé ne démontre pas un plafond par mission. [Limites projets OpenAI](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform), [facturation Gemini](https://ai.google.dev/gemini-api/docs/billing), [forfaits et usage Cursor](https://cursor.com/docs/models-and-pricing)

## 5 · Coûts indicatifs et qualification

**Simulation de coût brut** pour 100 000 jetons d’entrée et 20 000 de sortie, sans cache, taxes, changement de devise ni outils. Le nombre de tours et le coût par résultat accepté doivent être mesurés au pilote.

| Référence tarifaire | USD par million entrée / sortie | Exemple en USD |
|---|---:|---:|
| GPT‑5.4 mini | 0,75 / 4,50 | 0,165 |
| Gemini 3.1 Flash-Lite, texte standard | 0,25 / 1,50 | 0,055 |
| Claude Sonnet 5.5 | 2,00 / 10,00 | 0,400 |

Les prix ci-dessus sont des exemples documentaires pour les modèles nommés. Le quota gratuit Gemini est limité et dépend du compte, du modèle et des conditions d’usage des données. Codex, Claude Code et Cursor doivent être évalués avec le compte réel. Cursor documente des offres actuelles et d’anciens forfaits maintenus, avec règles de pool et de dépassement distinctes. Ollama local évite la facture d’API lorsque le cloud est désactivé et le réseau contrôlé. Matériel, électricité et exploitation restent à budgéter. [OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Google](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [Cursor](https://cursor.com/docs/models-and-pricing)

| Lot de recette | Preuve exigée après autorisation |
|---|---|
| Sans IA | Création de mission structurée, attribution, tests, synthèse, export, reprise et incidents avec profils modèles retirés |
| Homologation de l’API | Compte isolé, version, contexte et coût vérifiés à partir d’entrées synthétiques. Provoquer sortie tronquée, manque de fonds, timeout ambigu, refus de l’outil et réconciliation |
| Homologation d’un moteur CLI | Privilèges fichiers et terminal, réseau, profil de modèle, arrêt des descendants, session reconstruite et effets vérifiés |
| Bascule réelle autorisée | Partir du même checkpoint et démontrer qu’une route valide reprend, qu’une route non autorisée ne reçoit aucune donnée et qu’aucun dépassement de budget n’est masqué |
| Comparaison de qualité | Corpus synthétique versionné, mêmes critères métier, taux de réussite, latence, coût par résultat accepté et effort de reprise |

Les tâches qui exigent une génération ouverte peuvent attendre un moteur ou être converties en mode humain selon le plan. Aucune fonction de contrôle, d’audit, de sauvegarde ou d’export ne doit dépendre d’un fournisseur. Voir [budget](12-budget-et-scenarios-economiques.md).


### Vérification locale effectivement exécutée

Un modèle conceptuel Python sans réseau a exercé **96 combinaisons synthétiques** de disponibilité, homologation, capacité, données admissibles, destination et budget. Seule la combinaison satisfaisant toutes les conditions a créé une nouvelle tentative. **Sept assertions ciblées** ont vérifié le blocage dans chacune des quatre portées, la reprise autorisée si les deux consommations sont couvertes, la réconciliation sans cette autorisation et la réconciliation prioritaire d’un effet incertain. Les trois calculs tarifaires ont été recalculés en décimal. Cette simulation valide la logique de décision décrite. Elle ne teste ni une transaction concurrente en base, ni la comptabilisation ou l’annulation d’une API réelle.
