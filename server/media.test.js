import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backupDatabase,restoreDatabase} from '../scripts/backup.js';
import sharp from 'sharp';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';
import {initial} from '../src/model.js';
async function setup(t,options={}){
 const app=await createApp({...await testDatabase(t),...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(r=>app.server.close(r)));const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=(path,{cookie,body,method=body?'POST':'GET'}={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 async function register(email='media@example.test'){const r=await request('/api/auth/register',{body:{email,name:'Auteur',password:'image test password 123'}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 return {...app,request,register};
}
const png=color=>sharp({create:{width:96,height:128,channels:3,background:color}}).png().toBuffer();
async function upload(request,cookie,bytes){const r=await request('/api/media',{cookie,body:{data:bytes.toString('base64')}});assert.ok([200,201].includes(r.status),await r.clone().text());return r.json();}
test('normalise les images et refuse les accès ou références d’un autre utilisateur',async t=>{
 const {request,register}=await setup(t);const a=await register(),b=await register('other@example.test');const source=await png('#5a6f40');
 assert.equal((await request('/api/media',{body:{data:source.toString('base64')}})).status,401);
 const image=await upload(request,a,source);assert.equal(image.width,96);assert.equal(image.height,128);
 assert.equal((await upload(request,a,source)).id,image.id);
 const served=await request('/api/media/'+image.id,{cookie:a});assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/webp');assert.equal(served.headers.get('cache-control'),'private, no-store');
 const bytes=Buffer.from(await served.arrayBuffer());assert.equal((await sharp(bytes).metadata()).format,'webp');assert.equal((await upload(request,a,bytes)).id,image.id);
 assert.equal((await request('/api/media/'+image.id,{cookie:b})).status,404);assert.equal((await request('/api/media/'+image.id)).status,401);
 const library=structuredClone(initial);library.projects[0].entities[0].portraitImage=image.id;
 assert.equal((await request('/api/library',{cookie:b,method:'PUT',body:{data:library,revision:0}})).status,400);
 assert.equal((await request('/api/library',{cookie:a,method:'PUT',body:{data:library,revision:0}})).status,200);
 const copied=await upload(request,b,bytes);assert.notEqual(copied.id,image.id);library.projects[0].entities[0].portraitImage=copied.id;assert.equal((await request('/api/library',{cookie:b,method:'PUT',body:{data:library,revision:0}})).status,200);
});
test('refuse les faux fichiers, SVG et images trop grandes',async t=>{
 const {request,register}=await setup(t);const cookie=await register();
 for(const data of ['not base64!',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),Buffer.from('not an image').toString('base64'),'A'.repeat(4*1024*1024+4)])assert.equal((await request('/api/media',{cookie,body:{data}})).status,400);
 const big=await sharp({create:{width:5100,height:5100,channels:3,background:'#222222'}}).png().toBuffer();assert.equal((await request('/api/media',{cookie,body:{data:big.toString('base64')}})).status,400);
});
test('corrige l’orientation, réduit les dimensions et retire les métadonnées',async t=>{
 const {request,register}=await setup(t);const cookie=await register();const bytes=await sharp({create:{width:2600,height:1300,channels:3,background:'#123456'}}).withMetadata({orientation:6}).jpeg().toBuffer();
 const image=await upload(request,cookie,bytes);assert.equal(image.width,1000);assert.equal(image.height,2000);
 const response=await request('/api/media/'+image.id,{cookie});const info=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(info.orientation,undefined);assert.equal(info.exif,undefined);
});
test('enregistre les nouvelles sections, champs libres, rôles et références d’images',async t=>{
 const {request,register}=await setup(t);const cookie=await register();const image=await upload(request,cookie,await png('#994411'));const data=structuredClone(initial),p=data.projects[0],e=p.entities[0];
 p.coverImage=image.id;p.chapters[0].coverImage=image.id;e.portraitImage=image.id;e.coverImage=image.id;e.gallery=[{id:image.id,caption:'Une inspiration'}];e.character={age:'18',pronouns:'Elle',motivation:'Retrouver son frère',arc:'Apprendre à faire confiance'};e.customFields=[{id:'field-1',label:'Devise',value:'Ne jamais céder'}];e.role='Antagoniste';
 assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data,revision:0}})).status,200);const saved=(await(await request('/api/library',{cookie})).json()).data.projects[0];assert.deepEqual(saved.entities[0].character,e.character);assert.deepEqual(saved.entities[0].gallery,e.gallery);assert.deepEqual(saved.entities[0].customFields,e.customFields);assert.equal(saved.coverImage,image.id);
 data.projects[0].entities[0].portraitImage='javascript:alert(1)';assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data,revision:1}})).status,400);
});
test('applique le quota avant d’écrire dans la base',async t=>{
 const {request,register,db}=await setup(t,{imageQuotaBytes:1});const cookie=await register();const r=await request('/api/media',{cookie,body:{data:(await png('#334455')).toString('base64')}});assert.equal(r.status,413);assert.equal(Number((await db.query('SELECT count(*) AS count FROM media')).rows[0].count),0);
});
test('le nettoyage différé conserve les images encore utilisées',async t=>{
 let time=1_000_000;const {request,register}=await setup(t,{now:()=>time});let cookie=await register();const used=await upload(request,cookie,await png('#bb0000')),unused=await upload(request,cookie,await png('#0000bb'));const data=structuredClone(initial);data.projects[0].coverImage=used.id;assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data,revision:0}})).status,200);
 time+=8*86400000;const login=await request('/api/auth/login',{body:{email:'media@example.test',password:'image test password 123'}});cookie=login.headers.get('set-cookie').split(';')[0];await upload(request,cookie,await png('#00bb00'));
 assert.equal((await request('/api/media/'+used.id,{cookie})).status,200);assert.equal((await request('/api/media/'+unused.id,{cookie})).status,404);
});
test('la sauvegarde PostgreSQL restaure les images et les projets',async t=>{
 const options=await testDatabase(t);const {request,register,db,server}=await setup(t,options);const cookie=await register();const image=await upload(request,cookie,await png('#876543'));const data=structuredClone(initial);data.projects[0].coverImage=image.id;await request('/api/library',{cookie,method:'PUT',body:{data,revision:0}});
 const dir=mkdtempSync(join(tmpdir(),'atlas-media-backup-'));const file=join(dir,'backup.dump');
 try{
  await backupDatabase({connectionString:options.databaseUrl,target:file,schema:options.schema});
  await db.query(`DROP SCHEMA ${options.schema} CASCADE`);
  await restoreDatabase({connectionString:options.databaseUrl,source:file});
  const stored=(await db.query('SELECT body FROM media WHERE id=$1',[image.id])).rows[0];
  assert.equal((await sharp(stored.body).metadata()).format,'webp');assert.equal((await db.query('SELECT body FROM libraries')).rows[0].body.projects[0].coverImage,image.id);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('deux imports simultanés respectent le quota et dédupliquent les images',async t=>{
 const source=await png('#223344');const normalized=await sharp(source).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
 const {request,register,db}=await setup(t,{imageQuotaBytes:normalized.length+10});const cookie=await register();
 const results=await Promise.all([source,source].map(bytes=>request('/api/media',{cookie,body:{data:bytes.toString('base64')}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);const ids=await Promise.all(results.map(r=>r.json()));assert.equal(ids[0].id,ids[1].id);
 const extra=await request('/api/media',{cookie,body:{data:(await png('#ff2222')).toString('base64')}});assert.equal(extra.status,413);assert.equal((await db.query('SELECT count(*)::integer AS n FROM media')).rows[0].n,1);
});

test('les liens HTTPS sont conservés sans importer les images dans PostgreSQL',async t=>{
 const {request,register,db}=await setup(t);const cookie=await register();const data=structuredClone(initial),p=data.projects[0];const url='https://images.example.test/portrait.webp?v=2';
 p.coverImage=url;p.chapters[0].coverImage=url;p.entities[0].portraitImage=url;p.entities[0].coverImage=url;p.entities[0].gallery=[{id:url,caption:'Image externe'}];
 assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data,revision:0}})).status,200);
 const saved=(await(await request('/api/library',{cookie})).json()).data.projects[0];assert.equal(saved.coverImage,url);assert.equal(saved.chapters[0].coverImage,url);assert.equal(saved.entities[0].portraitImage,url);assert.equal(saved.entities[0].gallery[0].id,url);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM media')).rows[0].n,0);
 for(const invalid of ['http://images.example.test/a.jpg','javascript:alert(1)','data:image/png;base64,AAAA','file:///etc/passwd','/api/media/not-owned','https://user:secret@example.test/a.jpg','https://example.test/'+ 'x'.repeat(4096)]){
  const changed=structuredClone(data);changed.projects[0].coverImage=invalid;
  assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data:changed,revision:1}})).status,400);
 }
 assert.equal((await(await request('/api/library',{cookie})).json()).revision,1);
});
