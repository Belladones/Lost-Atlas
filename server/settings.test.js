import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';
test('le thème adaptatif est personnel, validé et conservé après redémarrage',async t=>{
 const options=await testDatabase(t);let app=await createApp({...options,oauthEnv:{}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));await app.db.close();});
 const request=(path,{cookie,method='GET',data}={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const register=async email=>{const r=await request('/api/auth/register',{method:'POST',data:{email,name:'Auteur',password:'settings password 123'}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 assert.equal((await request('/api/settings')).status,401);assert.equal((await request('/api/settings',{method:'PUT',data:{adaptiveTheme:false}})).status,401);
 const a=await register('settings-a@example.test'),b=await register('settings-b@example.test');assert.deepEqual(await(await request('/api/settings',{cookie:a})).json(),{settings:{adaptiveTheme:true}});
 assert.equal((await request('/api/settings',{cookie:a,method:'PUT',data:{adaptiveTheme:false}})).status,200);
 assert.deepEqual(await(await request('/api/settings',{cookie:a})).json(),{settings:{adaptiveTheme:false}});assert.deepEqual(await(await request('/api/settings',{cookie:b})).json(),{settings:{adaptiveTheme:true}});
 for(const data of [{adaptiveTheme:'false'},{},{adaptiveTheme:false,user_id:'other'}])assert.equal((await request('/api/settings',{cookie:a,method:'PUT',data})).status,400);
 await new Promise(resolve=>app.server.close(resolve));await app.db.close();app=await createApp({...options,oauthEnv:{}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;
 assert.deepEqual(await(await request('/api/settings',{cookie:a})).json(),{settings:{adaptiveTheme:false}});assert.deepEqual((await(await request('/api/library',{cookie:a})).json()).data,{projects:[],active:null});
 assert.equal((await request('/api/settings',{cookie:a,method:'PUT',data:{adaptiveTheme:true}})).status,200);assert.deepEqual(await(await request('/api/settings',{cookie:a})).json(),{settings:{adaptiveTheme:true}});
});
