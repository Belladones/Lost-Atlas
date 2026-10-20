# Lost Atlas

Atelier narratif en français : projets, encyclopédie, chapitres à mentions cliquables et relations. Une API Node.js stocke désormais les comptes et leurs bibliothèques privées dans SQLite.

## Démarrage en développement

Node.js **24 ou plus récent**, npm. Aucun service de base de données externe ni clé API nécessaire.

```sh
cd /workspace/Lost-Atlas
npm ci --cache /tmp/lost-atlas-npm
npm run dev
```

Cette commande lance l’API sur le port 3001 et Vite sur le port 5173. Vite transmet `/api` au serveur. Créez votre compte depuis l’écran d’accueil : nom, adresse email et mot de passe d’au moins 12 caractères. Aucun compte ou mot de passe par défaut.

```sh
npm test
npm run build
```

Les tests couvrent les mentions, l’authentification, l’isolation des bibliothèques, la validation, les conflits de sauvegarde, les sessions expirées, les requêtes intersites, la limitation des tentatives et la persistance après redémarrage, la validation des images, leur confidentialité et leur sauvegarde, ainsi que les points de vue relationnels et la géométrie du graphe.

## Stockage et utilisateurs

Chaque compte possède sa bibliothèque ; le serveur déduit son propriétaire de la session et n’accepte aucun identifiant utilisateur fourni par le navigateur pour accéder aux données. Un nouvel utilisateur reçoit une copie indépendante de l’univers de démonstration.

Les mots de passe sont hachés avec scrypt et un sel aléatoire. Les sessions durent sept jours et sont stockées sous forme hachée dans SQLite ; leur cookie est HttpOnly et SameSite=Lax (également Secure en production). La déconnexion révoque la session courante. Les écritures sont validées côté serveur ; les requêtes provenant d’un autre site sont refusées. L’API limite les tentatives d’authentification par IP (20 par 15 minutes ; compteur en mémoire, réinitialisé au redémarrage).

Les modifications sont enregistrées automatiquement après une courte pause. Un indicateur signale les écritures en attente ou les échecs. La déconnexion attend la sauvegarde. En cas de coupure, utilisez « Réessayer » ou exportez les modifications. Un avertissement navigateur protège la fermeture d’une page contenant des modifications non enregistrées ; il ne constitue pas une sauvegarde garantie. En cas de conflit entre fenêtres, exportez votre travail puis rechargez la page pour récupérer la version du serveur : aucune version récente n’est écrasée silencieusement.

Le stockage porte sur la bibliothèque complète au format JSON validé, versionnée par compteur de révision, dans une ligne SQLite par utilisateur. Limite de requête : **5 Mo**. Il ne s’agit pas encore d’un historique de versions ni d’un système de collaboration en temps réel.

## Récupérer les anciens projets locaux

Connectez-vous puis ouvrez **Ma bibliothèque → Importer mes anciens projets locaux**, sur le navigateur et l’adresse utilisés par l’ancienne version. Le bouton apparaît uniquement si une ancienne bibliothèque locale existe. Ne l’utilisez que pour vos propres projets, notamment sur un appareil partagé. La copie locale reste intacte. Sinon, importez votre ancien export JSON dans « Ma bibliothèque ». L’import ajoute des projets et ne remplace pas ceux du compte.

L’export JSON de toute la bibliothèque reste disponible dans le pied de page ; il inclut les images utilisées, encodées avec les projets. L’import (fichier de 100 Mo maximum) réimporte les images dans le compte connecté et réécrit leurs références privées ; chaque chapitre peut aussi être exporté en texte. Les anciens exports sans images restent compatibles. Une sauvegarde sans fichiers image ne peut réutiliser ses références que dans le compte qui les possède. En cas de coupure réseau, l’action « Exporter sans les images » permet de sauvegarder les textes et propriétés sans attendre les fichiers.

## Production

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://atlas.example.com DATABASE_PATH=/chemin/persistant/atlas.sqlite npm start
```

Le serveur sert `dist/` et `/api` depuis la même origine. Placez-le derrière un reverse proxy HTTPS. `APP_ORIGIN` doit correspondre exactement à l’adresse publique, sans slash final. Le cookie Secure nécessite HTTPS. `PORT` vaut 3001 et `HOST` vaut `0.0.0.0` par défaut. Les exemples de variables sont dans `.env.example` ; Node peut charger un fichier avec `node --env-file=.env server/index.js`. `npm run preview` affiche uniquement les fichiers statiques et ne remplace pas le serveur complet.

Montez un **volume persistant** pour `DATABASE_PATH` et son dossier : SQLite utilise aussi les fichiers `-wal` et `-shm`. Le dossier `data/` et les fichiers de base sont exclus de Git. Une machine ou un disque éphémère supprimé peut perdre les données. SQLite convient ici à une instance serveur unique ; plusieurs réplicas nécessiteraient une architecture de stockage différente. `/api/health` vérifie la connexion à SQLite.

## Sauvegardes

```sh
npm run backup
# ou avec la même variable DATABASE_PATH que le serveur :
DATABASE_PATH=/chemin/persistant/atlas.sqlite npm run backup -- /chemin/protege/sauvegarde.sqlite
```

Le script utilise l’API de sauvegarde SQLite pour une copie cohérente même quand le serveur tourne. Il refuse d’écraser un fichier existant. Le fichier contient les données de tous les comptes : limitez son accès et conservez une copie hors de la machine. Pour restaurer, arrêtez le serveur, conservez une copie de la base actuelle et de ses fichiers WAL/SHM, puis remplacez la base par la sauvegarde avant de redémarrer.

## Fiches détaillées et personnalisation

**Modifier la fiche** ouvre un éditeur à onglets. Pour les personnages :

- L’essentiel : nom, alias, présentation et liste de rôles (principal, protagoniste, antagoniste, deutéragoniste, secondaire, allié, rival, mentor, confident, intérêt amoureux, figurant). **Autre** permet un rôle personnalisé ; les anciens rôles libres restent conservés.
- Identité : âge, pronoms, espèce/peuple, profession, lieu de naissance et lieu de vie.
- Psychologie : personnalité, forces, faiblesses, peurs, valeurs et motivations.
- Histoire et arc : passé, objectif, conflit intérieur, secrets, évolution et capacités.
- Apparence : physique, tenues, signes distinctifs et voix.
- Champs libres : jusqu’à 50 propriétés personnalisées, avec nom et valeur, également disponibles pour les lieux et organisations.

La fiche de consultation présente ces sections, les alias, les relations et les apparitions dans les chapitres. La recherche inclut les rôles et les nouveaux champs.

### Images

Dans l’onglet **Images** des fiches, ajoutez un portrait, une couverture et jusqu’à 24 inspirations légendées. La galerie ouvre les images en grand. Les miniatures et couvertures s’affichent dans l’encyclopédie, le tableau de bord et le panneau de consultation. Les images peuvent être remplacées ou retirées avant d’enregistrer.

**Personnaliser le projet** permet de modifier son nom, son ambiance, sa description et sa couverture. Le bouton image de la barre du manuscrit personnalise la couverture du chapitre sans modifier son texte.

Formats : **JPG, PNG, WebP**, 3 Mo et 25 mégapixels maximum par fichier. Le serveur vérifie le décodage, corrige l’orientation, retire les métadonnées, limite les dimensions à 2 000 pixels et stocke une version WebP. Les fichiers restent privés, servis uniquement à leur propriétaire et sans cache partagé. Les images sont stockées en BLOB dans la même base SQLite : la sauvegarde serveur les inclut automatiquement, sans dossier média à gérer.

Chaque compte dispose de 50 Mo de stockage d’images compressées. Les doublons sont réutilisés au sein d’un compte. Lors de l’import d’une nouvelle image, le serveur supprime les fichiers non référencés dont le dernier import remonte à plus de sept jours. Une image ancienne retirée d’un projet peut donc être purgée au prochain import. Le quota compte aussi les fichiers temporaires issus d’un import interrompu. Les images encore référencées dans les projets sont conservées. Les exports JSON emportent uniquement les images réellement utilisées par les projets exportés.

## Relations à deux points de vue et graphe global

Dans **Relations**, créez ou modifiez un lien en choisissant les fiches A et B, sa nature et deux explications indépendantes :

- **A → B** : ce que A ressent envers B, ses attentes, sa confiance ou ses secrets.
- **B → A** : le point de vue de B sur A. Il peut être complètement différent.

Par exemple : Cassie est amoureuse de Léo, alors que Léo la considère comme une amie. Un point de vue peut rester vide. Le bouton d’inversion échange les fiches **et** leurs explications pour préserver leur sens. Les anciennes relations sont conservées ; leurs explications restent vides tant que vous ne les complétez pas. Modifier un lien ne le duplique pas.

Dans la fiche d’un personnage, **Liens & mentions** présente les deux côtés, en affichant d’abord son propre point de vue. Vous pouvez ouvrir l’autre fiche ou modifier la relation sur place. Les nouvelles explications sont sauvegardées sur le serveur et conservées dans les exports/imports JSON.

Le **Graphe global** montre toutes les fiches du projet actif (personnages, lieux et organisations), y compris celles sans relation. Chaque lien comporte deux flèches : trait plein pour A → B, pointillé pour B → A. Cliquez sur un lien pour consulter ses deux explications dans le panneau latéral, ou sur une fiche pour explorer ses connexions et l’ouvrir. Les relations parallèles et les liens sur soi-même sont dessinés séparément.

Déplacez les nœuds ou le fond, utilisez les boutons de zoom, **Afficher tout le graphe** ou **Centrer sur la sélection**. Le graphe peut aussi être parcouru au clavier : Tab pour sélectionner un élément, Entrée/Espace pour l’activer, +/−/0 lorsque le fond a le focus pour zoomer ou recadrer. La recherche met les fiches en évidence sans masquer le reste du graphe. Les positions et le cadrage sont temporaires : ils ne modifient pas les projets et se réinitialisent lors d’un changement de structure, de taille d’écran ou de vue.

La **Liste détaillée** affiche les deux points de vue côte à côte (ou l’un sous l’autre sur mobile), avec recherche dans les noms, la nature des liens et leurs explications. Les actions d’édition et de suppression restent accessibles. Supprimer une fiche retire automatiquement ses relations du graphe.

## Supprimer des éléments

- Fiche (personnage, lieu, organisation) : ouvrez-la puis choisissez **Supprimer cette fiche**. Ses relations sont retirées automatiquement ; le texte des chapitres reste intact et les anciennes mentions redeviennent du texte simple.
- Chapitre : utilisez la corbeille dans la liste ou dans la barre de l’éditeur. Les autres chapitres et les fiches sont conservés.
- Relation : utilisez sa corbeille dans Relations ; les deux fiches restent présentes.
- Projet : ouvrez **Ma bibliothèque** puis utilisez la corbeille à côté du projet. Tous ses chapitres, fiches et relations sont supprimés.

Chaque suppression demande confirmation et propose d’exporter le projet au préalable. Elle est définitive après enregistrement sur le serveur, sans corbeille de récupération. Le dernier projet peut être supprimé : la bibliothèque reste vide et permet de créer un projet ou d’importer une sauvegarde. Les données des autres comptes restent inchangées.

L’interface utilise une direction artistique nocturne : charbon, ivoire, titrage éditorial et motifs célestes, sur ordinateur comme sur mobile.

## Périmètre actuel

Il n’existe pas encore de validation d’email, récupération de mot de passe par email, gestion administrative des utilisateurs, partage entre auteurs, historique des versions ni partage public des médias. L’inscription est ouverte : configurez l’accès au site selon votre usage avant de l’exposer publiquement.

Les mentions sont détectées dynamiquement en lecture et ouvrent une fiche par son identifiant. Après un changement de nom, conservez l’ancien nom dans les alias. Les références persistantes d’un éditeur riche restent une prochaine étape. Les illustrations sont en CSS et les polices utilisent les familles disponibles sur votre appareil, sans chargement externe. Aucun manuscrit n’est transmis à un service d’IA.
