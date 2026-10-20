import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from './app.js';
import {initial} from '../src/model.js';
async function fixture(t){const {server}=createApp({dbPath:':memory:'});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;const request=(path,cookie,body,method=body?'POST':'GET')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const reg=await request('/api/auth/register',null,{name:'Auteur',email:'relations@example.test',password:'relations password 123'});return {request,cookie:reg.headers.get('set-cookie').split(';')[0]};}
test('l’API persiste chaque explication sans inverser les côtés ni supprimer les liens existants',async t=>{
 const {request,cookie}=await fixture(t);const data=structuredClone(initial),relation=data.projects[0].relations[0];relation.id='relation-1';relation.fromDescription='Cassie admire Léo.';relation.toDescription='Léo se méfie de Cassie.';
 assert.equal((await request('/api/library',cookie,{data,revision:0},'PUT')).status,200);const saved=(await(await request('/api/library',cookie)).json()).data;assert.equal(saved.projects[0].relations.length,2);assert.equal(saved.projects[0].relations[0].fromDescription,relation.fromDescription);assert.equal(saved.projects[0].relations[0].toDescription,relation.toDescription);assert.equal(saved.projects[0].relations[1].label,initial.projects[0].relations[1].label);assert.equal(saved.projects[0].relations[1].fromDescription,'');
});
test('l’API accepte une seule explication mais refuse un type ou une taille invalides',async t=>{
 const {request,cookie}=await fixture(t);const data=structuredClone(initial);data.projects[0].relations[0].fromDescription='Une affection secrète.';assert.equal((await request('/api/library',cookie,{data,revision:0},'PUT')).status,200);
 for(const invalid of [42,'x'.repeat(10001)]){data.projects[0].relations[0].toDescription=invalid;assert.equal((await request('/api/library',cookie,{data,revision:1},'PUT')).status,400);}const saved=(await(await request('/api/library',cookie)).json()).data;assert.equal(saved.projects[0].relations[0].fromDescription,'Une affection secrète.');assert.equal(saved.projects[0].relations[0].toDescription,'');
});
