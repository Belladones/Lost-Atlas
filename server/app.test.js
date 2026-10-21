import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';
import {initial} from '../src/model.js';
async function setup(t,options={}){
 const app=await createApp({...await testDatabase(t),...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 t.after(()=>new Promise(resolve=>app.server.close(resolve)));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,{cookie,body,method=body?'POST':'GET',headers={}}={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
 async function register(email='author@example.test'){return request('/api/auth/register',{body:{name:'Auteur',email,password:'correct horse battery staple'}});}
 return {...app,request,register};
}
test('inscription, session HttpOnly, connexion, déconnexion et mot de passe haché',async t=>{
 const {request,register,db}=await setup(t);const registered=await register();assert.equal(registered.status,200);assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/SameSite=Lax/);
 const stored=(await db.query('SELECT password_hash FROM users')).rows[0].password_hash;assert.notEqual(stored,'correct horse battery staple');assert.match(stored,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 const cookie=registered.cookie;assert.equal((await request('/api/auth/me',{cookie})).body.user.email,'author@example.test');
 assert.equal((await request('/api/auth/login',{body:{email:'author@example.test',password:'wrong password here'}})).status,401);
 const login=await request('/api/auth/login',{body:{email:'AUTHOR@example.test',password:'correct horse battery staple'}});assert.equal(login.status,200);
 assert.equal((await request('/api/auth/logout',{method:'POST',body:{},cookie})).status,200);assert.equal((await request('/api/library',{cookie})).status,401);
 assert.equal((await request('/api/auth/me',{cookie:login.cookie})).status,200);
});
test('refuse accès anonyme, compte dupliqué et mot de passe faible',async t=>{
 const {request,register}=await setup(t);assert.equal((await request('/api/library')).status,401);assert.equal((await request('/api/library',{method:'PUT',body:{data:initial,revision:0}})).status,401);
 assert.equal((await request('/api/auth/register',{body:{name:'A',email:'a@example.test',password:'short'}})).status,400);await register();assert.equal((await register()).status,409);
});
test('bibliothèques privées et protection contre les écrasements concurrents',async t=>{
 const {request,register}=await setup(t);const a=await register('a@example.test'),b=await register('b@example.test');const data=structuredClone(initial);data.projects[0].name='Secret de A';
 assert.equal((await request('/api/library',{method:'PUT',cookie:a.cookie,body:{data,revision:0,user_id:b.body.user.id}})).status,200);
 assert.equal((await request('/api/library',{cookie:a.cookie})).body.data.projects[0].name,'Secret de A');assert.equal((await request('/api/library',{cookie:b.cookie})).body.data.projects[0].name,initial.projects[0].name);
 assert.equal((await request('/api/library/'+a.body.user.id,{cookie:b.cookie})).status,404);
 assert.equal((await request('/api/library',{method:'PUT',cookie:a.cookie,body:{data:initial,revision:0}})).status,409);
 assert.equal((await request('/api/library',{cookie:a.cookie})).body.data.projects[0].name,'Secret de A');
});
test('valide la structure, les doublons et les références des relations',async t=>{
 const {request,register}=await setup(t);const {cookie}=await register();
 for(const change of [d=>d.projects[0].chapters[0].text=42,d=>d.projects.push(d.projects[0]),d=>d.projects[0].relations[0].to='absent',d=>d.active='absent']){const data=structuredClone(initial);change(data);assert.equal((await request('/api/library',{cookie,method:'PUT',body:{data,revision:0}})).status,400);}
 assert.equal((await request('/api/library',{cookie})).body.revision,0);
});
test('refuse les écritures depuis un autre site et les sessions expirées',async t=>{
 let time=1000000;const {request,register}=await setup(t,{now:()=>time,appOrigin:'https://atlas.example.test',production:true});const a=await register();assert.match(a.headers.get('set-cookie'),/Secure/);
 assert.equal((await request('/api/library',{cookie:a.cookie,method:'PUT',headers:{Origin:'https://evil.example.test'},body:{data:initial,revision:0}})).status,403);
 assert.equal((await request('/api/auth/logout',{cookie:a.cookie,method:'POST',headers:{'Sec-Fetch-Site':'cross-site'},body:{}})).status,403);
 time+=8*86400000;assert.equal((await request('/api/library',{cookie:a.cookie})).status,401);
});
test('limite les tentatives de connexion',async t=>{
 const {request}=await setup(t);for(let i=0;i<20;i++)await request('/api/auth/login',{body:{email:'bad',password:'bad'}});
 const r=await request('/api/auth/login',{body:{email:'bad',password:'bad'}});assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));
});
test('les comptes, sessions et projets survivent au redémarrage du serveur',async t=>{
 const options=await testDatabase(t);
 const first=await createApp(options);first.server.listen(0,'127.0.0.1');await once(first.server,'listening');const base=`http://127.0.0.1:${first.server.address().port}`;
 const registered=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Auteur',email:'p@example.test',password:'persistent password 123'})});const cookie=registered.headers.get('set-cookie').split(';')[0];
 const data=structuredClone(initial);data.projects[0].chapters[0].text='Un manuscrit persistant.';const saved=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({data,revision:0})});assert.equal(saved.status,200);
 await new Promise(r=>first.server.close(r));const second=await setup(t,options);const result=await second.request('/api/library',{cookie});assert.equal(result.body.data.projects[0].chapters[0].text,'Un manuscrit persistant.');assert.equal(result.body.revision,1);
});
test('deux inscriptions simultanées ne créent pas de doublon',async t=>{
 const {register}=await setup(t);const results=await Promise.all([register(),register()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('la suppression du dernier projet reste persistante et privée',async t=>{
 const {request,register}=await setup(t);const a=await register('empty@example.test'),b=await register('other@example.test');
 const saved=await request('/api/library',{cookie:a.cookie,method:'PUT',body:{data:{projects:[],active:null},revision:0}});assert.equal(saved.status,200);
 const loaded=await request('/api/library',{cookie:a.cookie});assert.deepEqual(loaded.body.data,{projects:[],active:null});
 assert.equal((await request('/api/library',{cookie:b.cookie})).body.data.projects.length,1);
 assert.equal((await request('/api/library',{cookie:a.cookie,method:'PUT',body:{data:initial,revision:loaded.body.revision}})).status,200);
});
test('deux sauvegardes simultanées avec la même révision ne peuvent pas s’écraser',async t=>{
 const {request,register}=await setup(t);const {cookie}=await register();
 const results=await Promise.all(['Version A','Version B'].map(name=>{const data=structuredClone(initial);data.projects[0].name=name;return request('/api/library',{cookie,method:'PUT',body:{data,revision:0}});}));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await request('/api/library',{cookie})).body.revision,1);
});
