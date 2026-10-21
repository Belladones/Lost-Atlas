# Lost Atlas

Atelier narratif en français : projets, encyclopédie, chapitres à mentions cliquables et relations. Une API Node.js stocke désormais les comptes et leurs bibliothèques privées dans PostgreSQL.

## Démarrage en développement

Node.js **24 ou plus récent**, npm et PostgreSQL 17 ou plus récent. Docker Compose fournit une base locale ; vous pouvez aussi utiliser votre propre serveur PostgreSQL. Aucune clé API nécessaire.

```sh
cd /workspace/Lost-Atlas
npm ci
cp -n .env.example .env
docker compose up -d --wait
npm run dev
```

Cette commande lance l’API sur le port 3001 et Vite sur le port 5173. Vite transmet `/api` au serveur. Créez votre compte depuis l’écran d’accueil : nom, adresse email et mot de passe d’au moins 12 caractères. Aucun compte ou mot de passe par défaut.

```sh
# Une seule fois : base distincte, réservée aux tests.
docker compose exec db createdb -U atlas lost_atlas_test
# Le client PostgreSQL pg_dump/pg_restore doit être installé, ou fourni par Docker :
PG_CONTAINER=$(docker compose ps -q db) npm test
npm run build
```

`.env` est chargé automatiquement par le serveur, les tests et les scripts. `DATABASE_URL` sélectionne la base de l’application ; `TEST_DATABASE_URL` sélectionne une base réservée aux tests. Les tests créent puis suppriment uniquement leurs schémas aléatoires, sans réinitialiser les autres données. Le rôle de test doit pouvoir créer des schémas. Les variables déjà définies dans l’environnement sont prioritaires.

Les tests couvrent les mentions, l’authentification, l’isolation des bibliothèques, la validation, les conflits de sauvegarde, les sessions expirées, les requêtes intersites, la limitation des tentatives et la persistance après redémarrage, la validation des images, leur confidentialité et leur sauvegarde, ainsi que les points de vue relationnels et la géométrie du graphe.

## Stockage et utilisateurs

Chaque compte possède sa bibliothèque ; le serveur déduit son propriétaire de la session et n’accepte aucun identifiant utilisateur fourni par le navigateur pour accéder aux données. Un nouvel utilisateur reçoit une copie indépendante de l’univers de démonstration.

Les mots de passe sont hachés avec scrypt et un sel aléatoire. Les sessions durent sept jours et sont stockées sous forme hachée dans PostgreSQL ; leur cookie est HttpOnly et SameSite=Lax (également Secure en production). La déconnexion révoque la session courante. Les écritures sont validées côté serveur ; les requêtes provenant d’un autre site sont refusées. L’API limite les tentatives d’authentification par IP (20 par 15 minutes ; compteur en mémoire, réinitialisé au redémarrage).

Les modifications sont enregistrées automatiquement après une courte pause. Un indicateur signale les écritures en attente ou les échecs. La déconnexion attend la sauvegarde. En cas de coupure, utilisez « Réessayer » ou exportez les modifications. Un avertissement navigateur protège la fermeture d’une page contenant des modifications non enregistrées ; il ne constitue pas une sauvegarde garantie. En cas de conflit entre fenêtres, exportez votre travail puis rechargez la page pour récupérer la version du serveur : aucune version récente n’est écrasée silencieusement.

Le stockage porte sur la bibliothèque complète au format JSON validé, versionnée par compteur de révision, dans une ligne PostgreSQL JSONB par utilisateur. Limite de requête : **5 Mo**. Il ne s’agit pas encore d’un historique de versions ni d’un système de collaboration en temps réel.

## Récupérer les anciens projets locaux

Connectez-vous puis ouvrez **Ma bibliothèque → Importer mes anciens projets locaux**, sur le navigateur et l’adresse utilisés par l’ancienne version. Le bouton apparaît uniquement si une ancienne bibliothèque locale existe. Ne l’utilisez que pour vos propres projets, notamment sur un appareil partagé. La copie locale reste intacte. Sinon, importez votre ancien export JSON dans « Ma bibliothèque ». L’import ajoute des projets et ne remplace pas ceux du compte.

L’export JSON de toute la bibliothèque reste disponible dans le pied de page ; il inclut les images utilisées, encodées avec les projets. L’import (fichier de 100 Mo maximum) réimporte les images dans le compte connecté et réécrit leurs références privées ; chaque chapitre peut aussi être exporté en texte. Les anciens exports sans images restent compatibles. Une sauvegarde sans fichiers image ne peut réutiliser ses références que dans le compte qui les possède. En cas de coupure réseau, l’action « Exporter sans les images » permet de sauvegarder les textes et propriétés sans attendre les fichiers.

## Production

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://atlas.example.com npm start
# Définir DATABASE_URL avec les identifiants privés du serveur PostgreSQL.
```

Le serveur sert `dist/` et `/api` depuis la même origine. Placez-le derrière un reverse proxy HTTPS. `APP_ORIGIN` doit correspondre exactement à l’adresse publique, sans slash final. Le cookie Secure nécessite HTTPS. `PORT` vaut 3001 et `HOST` vaut `0.0.0.0` par défaut. Les exemples de variables sont dans `.env.example` ; Node peut charger un fichier avec `node --env-file=.env server/index.js`. `npm run preview` affiche uniquement les fichiers statiques et ne remplace pas le serveur complet.

Les comptes, sessions, projets et images sont conservés dans PostgreSQL. Configurez `DATABASE_URL` avec les identifiants de votre hébergeur et TLS vérifié (par exemple `sslmode=verify-full`, avec le certificat requis par le fournisseur). Aucun fichier SQLite n’est utilisé par le serveur. Le pool de connexions est partagé par les requêtes d’une instance ; les transactions et verrous PostgreSQL protègent les écritures concurrentes, y compris les quotas d’images. La limitation des connexions reste en mémoire par instance. `/api/health` vérifie PostgreSQL.

En développement, Docker conserve les données dans le volume `postgres_data`. `docker compose down` les conserve ; **`docker compose down -v` les détruit**. Le mot de passe de `.env.example` est exclusivement destiné à la base locale, dont le port est limité à l’interface locale. Utilisez un secret privé en production. Changer le mot de passe du fichier `.env` ne change pas celui d’un volume déjà initialisé.

## Neon avec un serveur Node (Render, VPS…)

Le projet conserve son serveur Node.js et son pilote `pg`. Neon héberge PostgreSQL ; le frontend et l’API restent hébergés sur Render ou votre serveur. `neon.ts` déclare uniquement PostgreSQL : les comptes et les images continuent d’utiliser les tables privées existantes.

```sh
npx neon@latest login
npx neon@latest init -y --org-id org-broad-flower-17963429 --project-id summer-queen-36701409 --branch production --services postgres
npx neon@latest deploy
npm run build
npm start
```

`neon deploy` provisionne les services déclarés et récupère leurs variables dans `.env` s’il existe, sinon dans `.env.local`. Le serveur, les tests et les scripts chargent les deux fichiers ; les variables du processus priment, puis `.env.local`, puis `.env`. Ne commitez jamais ces fichiers.

- `DATABASE_URL` : URL pooled fournie par Neon, pour les requêtes de l’application.
- `DATABASE_URL_UNPOOLED` : URL directe, utilisée par l’initialisation du schéma, le transfert SQLite et les sauvegardes. Sans cette variable, la connexion principale est utilisée pour PostgreSQL local.

Sur Render, ajoutez ces deux valeurs privées dans **Environment**, avec `NODE_ENV=production` et `APP_ORIGIN` égal à l’origine publique exacte du site, puis redéployez. Ne préfixez jamais les identifiants de base par `VITE_` : ils restent exclusivement côté serveur.

La liaison locale `.neon` est ignorée par Git. Si vous clonez le dépôt sur une nouvelle machine, relancez `neon init` ou `neon link` avec le projet et la branche ci-dessus avant `neon deploy`. Une connexion à Neon et des accès réseau à son API sont nécessaires. La compilation seule ne vérifie pas la connexion à la base ; vérifiez également `/api/health`, la création d’un compte, l’enregistrement puis la relecture d’un projet et d’une image.

## Transférer la base SQLite existante

Arrêtez l’ancienne application pour éviter des écritures pendant le transfert. Conservez une sauvegarde SQLite cohérente avec ses éventuels fichiers WAL/SHM. Configurez `DATABASE_URL` vers une **base PostgreSQL vide**, démarrez PostgreSQL, puis exécutez :

```sh
npm run migrate:sqlite -- ./data/lost-atlas.sqlite --dry-run
npm run migrate:sqlite -- ./data/lost-atlas.sqlite
npm run dev
```

Le transfert conserve les comptes et leurs mots de passe hachés, les sessions, les révisions, les projets, les fiches, les relations et les images privées. Il s’effectue dans une transaction : une erreur annule tout le transfert. Le script refuse une destination contenant des données et ne modifie ni ne supprime le fichier SQLite. La vérification `--dry-run` contrôle la source et la destination sans importer de lignes (les tables vides sont créées si nécessaire). L’import des anciens projets stockés uniquement dans le navigateur reste disponible dans l’application.

## Sauvegardes PostgreSQL

Installez les outils clients PostgreSQL (`pg_dump` et `pg_restore`, version au moins égale à celle du serveur), puis :

```sh
npm run backup -- ./data/backups/atlas.dump
# Si PostgreSQL est fourni par le Docker Compose local :
PG_CONTAINER=$(docker compose ps -q db) npm run backup -- ./data/backups/atlas.dump
```

Le script utilise `DATABASE_URL` chargé depuis `.env`. Il produit une sauvegarde PostgreSQL cohérente au format personnalisé, incluant les images, et refuse d’écraser un fichier existant. Les fichiers sont créés avec des droits restreints. Conservez une copie protégée hors de la machine.

Pour restaurer, arrêtez l’application et choisissez une **nouvelle base vide**. Avec les paramètres de connexion PostgreSQL (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) configurés pour cette destination :

```sh
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" ./data/backups/atlas.dump
```

Basculez ensuite `DATABASE_URL` vers la base restaurée et redémarrez l’application. Les tests vérifient une véritable sauvegarde/restauration des projets et des octets d’images, ainsi que le transfert SQLite et l’annulation d’un import en erreur.

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

Formats : **JPG, PNG, WebP**, 3 Mo et 25 mégapixels maximum par fichier. Le serveur vérifie le décodage, corrige l’orientation, retire les métadonnées, limite les dimensions à 2 000 pixels et stocke une version WebP. Les fichiers restent privés, servis uniquement à leur propriétaire et sans cache partagé. Les images sont stockées en BYTEA dans la même base PostgreSQL : la sauvegarde serveur les inclut automatiquement, sans dossier média à gérer.

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
