import './env.js';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDatabase} from '../server/database.js';
import {mediaIds} from '../shared/media.js';

export async function migrateSqlite({source,connectionString=process.env.DATABASE_URL,schema,dryRun=false}){
 const sqlite=new DatabaseSync(source,{readOnly:true});
 let db;
 try{
  sqlite.exec('BEGIN');
  if(sqlite.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||sqlite.prepare('PRAGMA foreign_key_check').all().length)throw Error('La base SQLite est incohérente. Aucun transfert effectué.');
  const tables=['users','libraries','sessions','media'];
  const rows=Object.fromEntries(tables.map(table=>[table,table==='media'&&!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media'").get()?[]:sqlite.prepare(`SELECT * FROM ${table}`).all()]));
  const users=new Set(rows.users.map(u=>u.id));const owners=new Map(rows.media.map(m=>[m.id,m.user_id]));
  for(const row of rows.libraries){
   row.body=JSON.parse(row.body);
   if(!users.has(row.user_id)||mediaIds(row.body).some(id=>owners.get(id)!==row.user_id))throw Error('Bibliothèque ou image privée incohérente. Aucun transfert effectué.');
  }
  if(rows.users.length!==rows.libraries.length)throw Error('Une bibliothèque manque. Aucun transfert effectué.');
  db=await createDatabase({connectionString,schema});
  await db.transaction(async()=>{
   await db.query('LOCK TABLE users,libraries,sessions,media IN ACCESS EXCLUSIVE MODE');
   for(const table of tables)if((await db.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw Error('La base PostgreSQL contient déjà des données. Utilisez une base vide ; aucune donnée n’a été remplacée.');
   if(dryRun)return;
   const columns={users:['id','email','name','password_hash','created_at'],libraries:['user_id','body','revision','updated_at'],sessions:['token_hash','user_id','expires_at'],media:['id','user_id','hash','body','width','height','created_at']};
   for(const table of tables){const fields=columns[table];for(const row of rows[table])await db.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(key=>table==='libraries'&&key==='body'?JSON.stringify(row[key]):key==='body'?Buffer.from(row[key]):row[key]));}
  });
  return Object.fromEntries(tables.map(table=>[table,rows[table].length]));
 }finally{sqlite.close();if(db)await db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const source=resolve(process.argv.slice(2).find(arg=>arg!=='--dry-run')||'data/lost-atlas.sqlite');
 try{const counts=await migrateSqlite({source,dryRun:process.argv.includes('--dry-run')});console.log(`${process.argv.includes('--dry-run')?'Vérification réussie':'Migration terminée'} : ${JSON.stringify(counts)}. Fichier SQLite conservé.`);}
 catch(error){console.error(error.code?'Migration impossible : vérifiez le fichier source, PostgreSQL et ses droits.':error.message);process.exitCode=1;}
}
