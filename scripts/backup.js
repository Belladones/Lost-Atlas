import './env.js';
import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync,unlinkSync,createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

function postgresTool(command,args,connectionString,{input,output}={}){
 if(!connectionString)throw Error('DATABASE_URL est requis.');
 const container=process.env.PG_CONTAINER;
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('URL PostgreSQL invalide.');
 const settings={PGHOST:url.hostname.replace(/^\[|\]$/g,''),PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:url.searchParams.get('sslmode')||'prefer',PGSSLROOTCERT:url.searchParams.get('sslrootcert')||''};
 for(const [key,value] of url.searchParams){const names={sslmode:'PGSSLMODE',sslrootcert:'PGSSLROOTCERT',sslcert:'PGSSLCERT',sslkey:'PGSSLKEY',options:'PGOPTIONS',application_name:'PGAPPNAME',connect_timeout:'PGCONNECT_TIMEOUT'};if(!names[key])throw Error('Option de connexion non prise en charge par la sauvegarde.');settings[names[key]]=value;}
 if(Object.values(settings).some(value=>/[\r\n]/.test(value)))throw Error('Paramètre de connexion invalide.');
 const executable=container?'docker':command;
 const reads=Object.keys(settings).map(key=>`IFS= read -r ${key}`).join('; ');
 const shell=`${reads}; export ${Object.keys(settings).join(' ')}; exec "$@"`;
 const argv=container?['exec','-i',container,'sh','-c',shell,'sh',command,...args]:args;
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,argv,{env:{...process.env,...settings},stdio:[container?'pipe':input??'ignore',output??'ignore','pipe']});
  if(container){
   child.stdin.on('error',()=>{});
   child.stdin.write(Object.values(settings).join('\n')+'\n');
   if(input!==undefined)createReadStream(null,{fd:input,autoClose:false}).pipe(child.stdin);else child.stdin.end();
  }
  // Do not echo connection strings or credentials from command errors.
  child.stderr.resume();
  child.on('error',error=>reject(Error(error.code==='ENOENT'?`${command} est requis (client PostgreSQL ou PG_CONTAINER).`:'Impossible de lancer l’outil PostgreSQL.')));
  child.on('exit',code=>code===0?resolve():reject(Error(`${command} a échoué. Vérifiez la connexion, les droits et la version du client PostgreSQL.`)));
 });
}
export async function backupDatabase({connectionString=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,target,schema}={}){
 mkdirSync(dirname(target),{recursive:true,mode:0o700});
 const fd=openSync(target,'wx',0o600);
 try{await postgresTool('pg_dump',['--format=custom','--no-owner','--no-acl',...(schema?['--schema',schema]:[])],connectionString,{output:fd});}
 catch(error){unlinkSync(target);throw error;}finally{closeSync(fd);}
}
// Restoration is deliberately explicit and never uses --clean or deletes existing data.
export async function restoreDatabase({connectionString,source}){
 const fd=openSync(source,'r');
 try{await postgresTool('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname',decodeURIComponent(new URL(connectionString).pathname.slice(1))],connectionString,{input:fd});}finally{closeSync(fd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const target=resolve(process.argv[2]||`data/backups/atlas-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
 try{await backupDatabase({target});console.log(`Sauvegarde créée : ${target}`);}catch(error){console.error(error.message);process.exitCode=1;}
}
