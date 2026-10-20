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

Les tests couvrent les mentions, l’authentification, l’isolation des bibliothèques, la validation, les conflits de sauvegarde, les sessions expirées, les requêtes intersites, la limitation des tentatives et la persistance après redémarrage.

## Stockage et utilisateurs

Chaque compte possède sa bibliothèque ; le serveur déduit son propriétaire de la session et n’accepte aucun identifiant utilisateur fourni par le navigateur pour accéder aux données. Un nouvel utilisateur reçoit une copie indépendante de l’univers de démonstration.

Les mots de passe sont hachés avec scrypt et un sel aléatoire. Les sessions durent sept jours et sont stockées sous forme hachée dans SQLite ; leur cookie est HttpOnly et SameSite=Lax (également Secure en production). La déconnexion révoque la session courante. Les écritures sont validées côté serveur ; les requêtes provenant d’un autre site sont refusées. L’API limite les tentatives d’authentification par IP (20 par 15 minutes ; compteur en mémoire, réinitialisé au redémarrage).

Les modifications sont enregistrées automatiquement après une courte pause. Un indicateur signale les écritures en attente ou les échecs. La déconnexion attend la sauvegarde. En cas de coupure, utilisez « Réessayer » ou exportez les modifications. Un avertissement navigateur protège la fermeture d’une page contenant des modifications non enregistrées ; il ne constitue pas une sauvegarde garantie. En cas de conflit entre fenêtres, exportez votre travail puis rechargez la page pour récupérer la version du serveur : aucune version récente n’est écrasée silencieusement.

Le stockage porte sur la bibliothèque complète au format JSON validé, versionnée par compteur de révision, dans une ligne SQLite par utilisateur. Limite de requête : **5 Mo**. Il ne s’agit pas encore d’un historique de versions ni d’un système de collaboration en temps réel.

## Récupérer les anciens projets locaux

Connectez-vous puis ouvrez **Ma bibliothèque → Importer mes anciens projets locaux**, sur le navigateur et l’adresse utilisés par l’ancienne version. Le bouton apparaît uniquement si une ancienne bibliothèque locale existe. Ne l’utilisez que pour vos propres projets, notamment sur un appareil partagé. La copie locale reste intacte. Sinon, importez votre ancien export JSON dans « Ma bibliothèque ». L’import ajoute des projets et ne remplace pas ceux du compte.

L’export JSON de toute la bibliothèque reste disponible dans le pied de page ; chaque chapitre peut aussi être exporté en texte.

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

## Périmètre actuel

Il n’existe pas encore de validation d’email, récupération de mot de passe par email, gestion administrative des utilisateurs, partage entre auteurs, historique des versions ni galerie de médias. L’inscription est ouverte : configurez l’accès au site selon votre usage avant de l’exposer publiquement.

Les mentions sont détectées dynamiquement en lecture et ouvrent une fiche par son identifiant. Après un changement de nom, conservez l’ancien nom dans les alias. Les références persistantes d’un éditeur riche restent une prochaine étape. Les illustrations sont en CSS ; les polices distantes sont facultatives avec repli local. Aucun manuscrit n’est transmis à un service d’IA.
