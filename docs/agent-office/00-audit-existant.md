# Audit initial du Loft · 27 novembre 2026

Le dépôt franckl136/fjstudio est en 0.4.0-rc.5. La branche de maturation pointe sur c12c66b, après le rapport 2b7db58. Le chantier utilise un worktree dédié issu de c12c66b et reprend neuf fichiers locaux du même chantier de représentation (adaptateurs Codex/Cursor, vues et tests). Les autres worktrees couvrent G5, Evolution et les candidates de livraison. Les changements non intégrés observés dans Evolution concernent Academy et Database Explorer. Le Studio actif conserve son propre répertoire.

## Chaîne observée

PostgreSQL fournit inscriptions, contacts datés, tentatives, baux, missions et checkpoints. La clé d'un poste associe projet, runner et rôle. Un contact est frais pendant 20 s pour A1 et 30 s pour Control. Un bail valide prime dans le modèle de poste actuel. Les six dernières affectations sont conservées dans sa vue, ainsi que toute affectation active. Une inscription sans contact ne prouve aucune présence. Aucune source de pause humaine. Les PR Cursor sont un relevé importé et le lecteur Codex observe des événements locaux. Lors du contrôle sur Folk & Joy, deux contacts Control étaient frais et quinze liens Cursor connus (six brouillons et neuf fusionnés). Ces nombres varient.

## Scène et limites

Le serveur rend quatre salles, des liens vers les postes, un répertoire Cursor et une relecture de synthèse. Le client met à jour un fragment toutes les 1,4 s et la page complète environ toutes les 6,5 s quand l'onglet est visible. Canvas dessine le mobilier en perspective et les sprites dans une couche DOM navigable. Le moteur possède déjà des chemins par portes, des places persistantes, une caméra par salle et un atlas avec repli procédural. Le café mélangeait sessions terminées, présence inconnue et disponibilité. Les titres au survol portaient une grande partie de l'information. La relecture historique pouvait prêter à confusion.

## Architecture cible

Conserver les lecteurs et les routes GET, séparer le modèle de présentation, la simulation locale et la scène. Distinguer les métriques de présence des quantités visibles et fournir un équivalent textuel, des fiches et une caméra utilisable au clavier. Tester les transitions avec des fixtures synthétiques isolées. La représentation ne commande aucun runner.
