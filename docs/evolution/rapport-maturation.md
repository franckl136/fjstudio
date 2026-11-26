# Rapport de maturation · 26 novembre 2026

**Décision de livraison.** Les neuf constats F01 à F09 ont passé la recette sur la candidate 0.4.0-rc.5. Cette version est destinée à la branche de développement. Le Studio ouvert sur le poste reste sur 0.4.0-rc.4.

| Sujet | Statut | Résultat ou limite |
|---|---|---|
| 1. Référence initiale | Terminé et testé | D:\DEV\FjStudio-Evolution était propre sur feat/studio-evolution, version 0.4.0-rc.4, révision c78a9d7. Six commits locaux suivaient la référence distante babcf35. |
| 2. Branche | Terminé et testé | feat/studio-product-maturation est la branche livrée. Son répertoire de travail est D:\DEV\FjStudio-Maturation. L’approfondissement en attente est conservé dans le répertoire Evolution. |
| 3. Architecture | Terminé et testé | Pages HTML du Core Node, modules de navigation et de formulaire côté navigateur, PostgreSQL local, workers existants. Aucune migration SQL dans ce lot. |
| 4. Constats de l’audit | Terminé et testé | F01 à F09 confrontés au PDF de huit pages, au rapport Markdown, aux mesures du DOM et aux captures. Les chiffres de l’audit initial et de la nouvelle recette sont identifiés séparément. |
| 5. Journal | Terminé et testé | Aperçu de cinq faits au plus, dix résultats par page, bornes, compte, filtres et liens vers les preuves. Titre et projet en premier, détail technique dépliable. |
| 6. Formulaires | Terminé et testé | La création et la révision d’une mission sont protégées. La garde par défaut compare la saisie aux valeurs initiales en mémoire. Les formulaires de connexion et les autres éditeurs ne sont pas enrôlés. |
| 7. Brouillons persistants | Terminé avec réserves | Option locale désactivée par défaut, déjà développée avant le recadrage. Chiffrement, isolation, arrêt complet, reprise et abandon ont été testés. Une activation pour l’usage quotidien reste une décision produit. |
| 8. Navigation | Terminé et testé | Choix explicite depuis le global, changement de projet dans le même espace, conservation du projet entre sept espaces et dans la documentation Academy. |
| 9. Responsive | Terminé et testé | Deux commandes au clavier, carte de projet avec état et lien de reprise, détails secondaires dépliables. Navigation et tableau tiennent dans leur conteneur à 390 px. |
| 10. Database Explorer | Terminé et testé | F08 livre la découverte, les messages sur l’accessibilité de la source et le schéma réellement visible. L’exploration relationnelle supplémentaire est conservée séparément. |
| 11. Provenance des données | Terminé et testé | Import, déclaration, capture observée, démonstration et source Git autorisée ont des libellés distincts. La date de capture atteste un instant de connexion. |
| 12. Quality et App Lab | Terminé et testé | Source, fichier, environnement, profil, commit et nature sont disponibles avant lancement. Les contrôles réalisés et incomplets figurent au rapport. Un exemple du Studio conserve sa mention dans le portefeuille, les preuves et le journal. |
| 13. Project Intelligence | Terminé et testé | Origine, source, commit documenté, date, version, statut et confiance sont lisibles sur la fiche. La validation reste explicite. Les liens vers les preuves sont limités au projet autorisé. |
| 14. Studio Academy | Terminé avec réserves | Les 19 exercices et leur carnet sont conservés et testés. Le retour aux outils et les liens entre guides conservent le contexte. Les nouvelles leçons envisagées relèvent du lot suivant. |
| 15. Agent Office | Terminé et testé | La scène pixel est conservée. Postes déclarés, contacts, baux et historique Cursor ont des sens distincts. L’animation et ses modes de secours ont été rejoués avec des postes synthétiques. L’audit initial observait deux postes disponibles et quinze sessions historiques. |
| 16. Tests exécutés | Terminé et testé | TypeScript, 108 tests Node, recette Chromium intégrée et trois parcours spécialisés sur la copie candidate. Confirmation par trois rôles synthétiques et bases jetables. |
| 17. Essais complémentaires | Non commencé | Téléphone physique, lecteurs d’écran, essai avec utilisateur, performance en charge. |
| 18. Résultats | Terminé et testé | 108/108, trois checkpoints sur la mission terminée, fixture A1 incorrecte rejetée. Mesures et commandes détaillées dans la recette. |
| 19. Limites | Terminé avec réserves | Les scénarios Notion/Supabase et les qualifications ont utilisé des sources de recette locales. Aucune disponibilité de compte externe ni qualification réelle d’une application externe déduite. Un administrateur, un opérateur et un lecteur de recette ont été exercés. |
| 20. Documentation | Terminé et testé | Audit, plan révisé, décisions, recette, présent rapport, guides du journal, des saisies, de la navigation, de la provenance, des Labs, de la base et du Loft. Changelog et version alignés. |
| 21. Commits | Terminé et testé | Audit 9b9fccb, saisies db49e0c, recadrage d12e74f, garde/F07 2a0a5b7, journal df0a49c, navigation 587f852, découverte b7ea193, Labs et preuves f95e4d2, version d588527, recette 1fc5451. Ce rapport est versionné après vérification du premier envoi. |
| 22. GitHub | Terminé et testé | Création de la branche de développement par push ordinaire. Premier SHA relu sur GitHub par git ls-remote · 1fc5451912ac0577e6c1c533b4db476b9151abb9. Les six ancêtres locaux de la version auditée font partie de son historique. Le dernier SHA de documentation peut être vérifié avec la même commande. |
| 23. Version et exploitation | Terminé et testé | Candidate 0.4.0-rc.5 testée au commit applicatif d588527. Budget supplémentaire 0 €. Aucun déploiement, tag, merge, changement de main ni écriture sur un projet externe. |
| 24. Prochaine étape | Préparé mais non connecté | Essai guidé de la candidate avec l’utilisateur sur un portefeuille témoin, puis décision d’activation. Dans un lot distinct, reprendre l’explorateur de voisinage et l’exercice PK/FK en réutilisant le diagramme et le carnet Academy existants. |

## Travail conservé pour le lot suivant

Les modifications locales du diagramme, des fiches de table, de l’attribution des migrations et les premiers changements du catalogue pédagogique sont dans D:\DEV\FjStudio-Evolution sur wip/studio-academy-explorer-local, dans l’arbre de travail. Ils sont exclus de la branche publiée. Le prototype Explorer a eu ses propres essais ; les nouvelles leçons sont partielles. L’activation de la persistance de saisie et celle de la candidate sur l’instance utilisée sont deux décisions indépendantes.

[Mesures et recette](recette-maturation.md) · [Plan révisé](plan-maturation.md) · [Décisions](decisions.md) · [Provenance](provenance.md)
