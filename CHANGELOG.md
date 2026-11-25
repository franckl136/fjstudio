# Historique du Studio

## 0.2.0-rc.1 · 25 novembre 2026 · candidate interne

Le Studio ajoute une campagne hors connexion reproductible pour Courses. Les scénarios relient les fautes injectées aux opérations, aux reçus SQL et à l’état visible après fermeture complète. Les preuves sont attachées au SHA mobile et vérifiées par empreinte. L’inventaire matériel et le verdict sur téléphone restent distincts de Chromium et PostgreSQL.

La candidate ajoute des outils et un dossier de qualification. Elle ne requiert aucune migration du Studio en service. Les migrations de Courses s’exécutent dans un PostgreSQL de test. Les historiques locaux G5 et G5.1 sont conservés. [Programme](docs/g5.2-programme.md) · [Références mobiles](docs/g5.2-isolation.md)

Le Studio utilise SemVer. Une nouvelle campagne outillée ou fonctionnalité compatible relève de MINOR, une correction compatible de PATCH, une rupture de MAJOR. Le suffixe rc identifie un candidat interne. La publication d’une release et l’activation du Studio sont des opérations distinctes.

## 0.1.0 · référence antérieure

Le dépôt public proposait le noyau A1. L’installation locale a poursuivi G5 et la qualification G5.1. Le dossier de campagne G5.2 documente la correspondance entre ces historiques.
