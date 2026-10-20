import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const source=resolve(process.env.DATABASE_PATH||'data/lost-atlas.sqlite');
if(!existsSync(source))throw Error('Base introuvable. Démarrez le serveur avant de créer une sauvegarde.');
const target=resolve(process.argv[2]||`data/backups/atlas-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if(existsSync(target))throw Error('La sauvegarde existe déjà : choisissez un autre nom.');
mkdirSync(dirname(target),{recursive:true,mode:0o700});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);console.log(`Sauvegarde créée : ${target}`);}finally{db.close();}
