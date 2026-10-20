# Lost Atlas

Un atelier narratif en français : projets, fiches de personnages, lieux et organisations, manuscrit et relations.

## Développement

Node.js 22 ou 24 et npm sont nécessaires.

```sh
cd /workspace/Lost-Atlas
npm ci --cache /tmp/lost-atlas-npm
npm run dev -- --port 5173
```

```sh
npm test
npm run build
```

Le dépôt inclut un univers de démonstration, Les Murmures de Meridian. Créez votre propre projet depuis « Nouveau projet ».

## Parcours

1. Créez un projet, puis des fiches depuis l’encyclopédie.
2. Renseignez les noms et alias séparés par des virgules.
3. Écrivez un chapitre dans Manuscrit. Le mode « Lecture & mentions » reconnaît les noms et ouvre la fiche correspondante sans quitter le chapitre.
4. Consultez les apparitions d’une fiche ou créez des relations entre fiches.
5. Exportez un chapitre en texte, ou toute la bibliothèque en JSON depuis le pied de page. L’import est accessible dans « Ma bibliothèque » et ajoute les projets sans remplacer les données existantes.

## Données et limites de cette première version

Les données sont enregistrées automatiquement dans le localStorage de ce navigateur, sur cet appareil et pour cette adresse d’application. L’effacement des données du navigateur les supprime : faites régulièrement un export JSON. Il n’existe pas encore de compte, synchronisation, stockage serveur, historique de versions, galerie ou collaboration. Le site n’envoie pas vos manuscrits à un service d’IA.

Les mentions sont détectées dynamiquement au moment de la lecture et ouvrent un identifiant de fiche ; elles ne sont pas encore des références persistantes dans un document riche. Pour conserver la détection après un changement de nom, ajoutez l’ancien nom dans les alias. Une prochaine étape pourra intégrer un éditeur Tiptap à références persistantes et un stockage PostgreSQL avec authentification et sauvegardes.

Les illustrations du tableau de bord sont réalisées en CSS. Les polices distantes sont facultatives et disposent de polices de repli.
