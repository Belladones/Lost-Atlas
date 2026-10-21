import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once,EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';
import {loadExternalImage,isPublicAddress} from './project-theme.js';
import {DEFAULT_BACKGROUND,darkCoverColor} from '../shared/theme.js';
const solid=color=>sharp({create:{width:100,height:60,channels:3,background:color}}).png().toBuffer();

test('les teintes de couverture restent sombres et discrètes',()=>{
 for(const source of [{r:255,g:0,b:0},{r:0,g:255,b:0},{r:0,g:0,b:255}]){const color=darkCoverColor(source);const values=color.slice(1).match(/../g).map(v=>parseInt(v,16));assert.ok(values.every(v=>v>=18&&v<=32));const dominant=Object.values(source).indexOf(255);assert.equal(values.indexOf(Math.max(...values)),dominant);}
 assert.equal(darkCoverColor({r:90,g:90,b:90}),DEFAULT_BACKGROUND);
});
test('refuse les réseaux privés, métadonnées cloud, DNS mixtes et ports non HTTPS',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','172.16.0.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
 let requested=false;const request=()=>{requested=true;throw Error('Must not request');};
 for(const address of ['127.0.0.1','169.254.169.254'])await assert.rejects(loadExternalImage('https://image.example.test/a.png',{resolveHost:async()=>[{address,family:4}],httpsRequest:request}));
 await assert.rejects(loadExternalImage('https://image.example.test/a.png',{resolveHost:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],httpsRequest:request}));
 await assert.rejects(loadExternalImage('https://example.test:3001/a.png',{httpsRequest:request}));assert.equal(requested,false);
});
test('épingle le DNS public et revérifie les destinations de redirection',async()=>{
 const bytes=await solid('#993344');let lookedUp=false;
 const httpsRequest=(_url,options,callback)=>{
  options.lookup('image.example.test',{all:true},(_error,addresses)=>{assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);lookedUp=true;});
  const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>queueMicrotask(()=>{const res=Readable.from([bytes]);res.statusCode=200;res.headers={};callback(res);res.on('end',()=>req.emit('close'));});return req;
 };
 assert.deepEqual(await loadExternalImage('https://image.example.test/a.png',{resolveHost:async()=>[{address:'8.8.8.8',family:4}],httpsRequest}),bytes);assert.equal(lookedUp,true);
 const redirectRequest=(_url,_options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>queueMicrotask(()=>{const res=Readable.from([]);res.statusCode=302;res.headers={location:'https://internal.example.test/private'};callback(res);res.on('end',()=>req.emit('close'));});return req;};
 await assert.rejects(loadExternalImage('https://image.example.test/a.png',{resolveHost:async hostname=>[{address:hostname==='internal.example.test'?'127.0.0.1':'8.8.8.8',family:4}],httpsRequest:redirectRequest}),/Private address/);
});
test('le fond suit la couverture du projet et garde le fond initial en cas d’absence ou d’erreur',async t=>{
 let loads=0;const app=await createApp({...await testDatabase(t),oauthEnv:{},themeImageLoader:async url=>{loads++;if(url.includes('missing'))throw Error('404');return solid('#2244cc');}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(resolve=>app.server.close(resolve)));const base=`http://127.0.0.1:${app.server.address().port}`;
 const reg=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Auteur',email:'theme@example.test',password:'cover theme password 123'})});const cookie=reg.headers.get('set-cookie').split(';')[0];
 const project={id:'own-project',name:'Fond',entities:[],chapters:[],relations:[]};let revision=0;
 const save=async()=>{const r=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({data:{projects:[project],active:project.id},revision:revision++})});assert.equal(r.status,200);};
 const theme=async()=>{const r=await fetch(base+'/api/project-theme?projectId='+project.id,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
 await save();assert.deepEqual(await theme(),{color:DEFAULT_BACKGROUND});
 const uploaded=await fetch(base+'/api/media',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({data:(await solid('#ee3322')).toString('base64')})});project.coverImage=(await uploaded.json()).id;await save();const red=(await theme()).color;assert.notEqual(red,DEFAULT_BACKGROUND);assert.ok(parseInt(red.slice(1,3),16)>parseInt(red.slice(5,7),16));
 project.coverImage='https://images.example.test/blue.png';await save();const blue=(await theme()).color;assert.notEqual(blue,red);assert.equal(loads,1);assert.equal((await theme()).color,blue);assert.equal(loads,1);
 project.coverImage='https://images.example.test/missing.png';await save();assert.deepEqual(await theme(),{color:DEFAULT_BACKGROUND});
 project.coverImage=null;await save();assert.deepEqual(await theme(),{color:DEFAULT_BACKGROUND});
 assert.equal((await fetch(base+'/api/project-theme?projectId=another',{headers:{Cookie:cookie}})).status,404);assert.equal((await fetch(base+'/api/project-theme?projectId='+project.id)).status,401);
});
