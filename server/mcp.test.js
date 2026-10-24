import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';
import {mcpConfiguration} from './mcp-auth.js';
import {initial} from '../src/model.js';

const origin='http://127.0.0.1:5173';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixtures=()=>{
 const data=structuredClone(initial);data.projects.push({...structuredClone(data.projects[0]),id:'secret',name:'PROJET NON AUTORISÉ',entities:[{id:'hidden',name:'Nom secret',type:'Personnage',alias:'',description:'SECRET INACCESSIBLE'}],chapters:[{id:'hidden-chapter',title:'Titre secret',status:'Idée',text:'SECRET INACCESSIBLE'}],relations:[]});return data;
};
async function setup(t,options={}){
 let time=Date.now();
 const database=await testDatabase(t),app=await createApp({...database,appOrigin:origin,mcpRedirectUris:callback,oauthEnv:{},now:()=>time,...options});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 t.after(async()=>{await new Promise(r=>app.server.close(r));await app.db.close();});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=(path,{method='GET',cookie,body,headers={},form,...extra}={})=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),...(form?{body:new URLSearchParams(form).toString()}:{}),...extra});
 async function account(email='author@example.test',data=fixtures()){
  const r=await request('/api/auth/register',{method:'POST',body:{name:'Auteur',email,password:'correct horse battery staple'}});assert.equal(r.status,200);
  const cookie=r.headers.get('set-cookie').split(';')[0],user=(await r.json()).user;
  assert.equal((await request('/api/library',{method:'PUT',cookie,body:{data,revision:0}})).status,200);
  return {cookie,user};
 }
 async function register(metadata={}){
  const r=await request('/register',{method:'POST',body:{redirect_uris:[callback],token_endpoint_auth_method:'none',...metadata}});assert.equal(r.status,201);return r.json();
 }
 async function begin(client,params={}){
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const query={client_id:client.client_id,redirect_uri:callback,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',scope:'atlas:read',state:'test-state',resource:origin+'/mcp',...params};
  const r=await request('/authorize?'+new URLSearchParams(query),{redirect:'manual'});
  return {r,query,verifier,requestId:r.headers.get('location')?new URL(r.headers.get('location')).searchParams.get('mcp_authorization'):null,browser:r.headers.get('set-cookie')?.split(';')[0]};
 }
 async function approve(client,owner,projectIds=['meridian']){
  const flow=await begin(client);assert.equal(flow.r.status,303);
  const cookie=owner.cookie+'; '+flow.browser;
  const r=await request('/api/mcp/authorization/'+flow.requestId,{method:'POST',cookie,body:{projectIds,sharingAccepted:true}});assert.equal(r.status,200);
  const redirect=new URL((await r.json()).redirect);assert.equal(redirect.origin,new URL(callback).origin);assert.equal(redirect.searchParams.get('state'),'test-state');
  return {...flow,cookie,code:redirect.searchParams.get('code')};
 }
 const redeem=(client,flow,extra={})=>request('/token',{method:'POST',form:{grant_type:'authorization_code',client_id:client.client_id,...(client.client_secret?{client_secret:client.client_secret}:{}),code:flow.code,code_verifier:flow.verifier,redirect_uri:callback,resource:origin+'/mcp',...extra}});
 async function tokens(client,owner,ids){const flow=await approve(client,owner,ids),r=await redeem(client,flow);assert.equal(r.status,200);return r.json();}
 async function connect(token){
  const client=new Client({name:'lost-atlas-integration-test',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));t.after(()=>client.close());return client;
 }
 const rpc=token=>request('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json, text/event-stream'},body:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}}});
 return {app,base,database,request,account,register,begin,approve,redeem,tokens,connect,rpc,advance:ms=>{time+=ms;}};
}
async function tool(client,name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,result.content?.[0]?.text);return JSON.parse(result.content[0].text);}

test('MCP : découverte OAuth, authentification obligatoire, hôte et origine vérifiés',async t=>{
 const f=await setup(t);
 const metadata=await(await f.request('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(metadata.resource,origin+'/mcp');assert.deepEqual(metadata.scopes_supported,['atlas:read']);
 const auth=await(await f.request('/.well-known/oauth-authorization-server')).json();assert.deepEqual(auth.code_challenge_methods_supported,['S256']);assert.equal(auth.registration_endpoint,origin+'/register');
 const r=await f.request('/mcp',{method:'POST',body:{}});assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/oauth-protected-resource\/mcp/);
 assert.equal((await f.request('/mcp',{method:'POST',body:{},headers:{Origin:'https://evil.example'}})).status,403);
 const hostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(f.base+'/mcp',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(hostStatus,403);
 assert.equal((await f.request('/api/mcp/connections')).status,401);
});

test('MCP : SDK réel, fiches, recherche, sommaire et chapitres uniquement dans les projets autorisés',async t=>{
 const f=await setup(t),owner=await f.account(),other=await f.account('other@example.test',{projects:[{...structuredClone(initial.projects[0]),id:'other-account',name:'AUTRE COMPTE'}],active:'other-account'}),client=await f.register(),tokens=await f.tokens(client,owner);
 const mcp=await f.connect(tokens.access_token),tools=(await mcp.listTools()).tools;
 assert.deepEqual(tools.map(t=>t.name).sort(),['fetch','get_entity','list_chapters','list_projects','read_chapter','search']);assert.ok(tools.every(t=>t.annotations.readOnlyHint&&!t.annotations.destructiveHint));
 const projects=await tool(mcp,'list_projects');assert.deepEqual(projects.items.map(p=>p.id),['meridian']);
 const results=await tool(mcp,'search',{query:'leo'});assert.ok(results.results.some(r=>r.title==='Léo Moreau'));assert.ok(results.results.every(r=>r.projectId==='meridian'));
 const entity=await tool(mcp,'get_entity',{projectId:'meridian',entityId:'cassie'});assert.equal(JSON.parse(entity.text).name,'Cassiopée Leroux');assert.equal(JSON.parse(entity.text).relations.length,2);assert.match(entity.url,/atlasEntity=cassie/);
 const chapters=await tool(mcp,'list_chapters',{projectId:'meridian'});assert.deepEqual(chapters.items.map(c=>c.position),[1,2]);
 const chapter=await tool(mcp,'read_chapter',{projectId:'meridian',chapterId:'ch1',offset:0,limit:20});assert.equal(chapter.text,initial.projects[0].chapters[0].text.slice(0,20));assert.equal(chapter.nextOffset,20);
 const fetched=await tool(mcp,'fetch',{id:results.results.find(r=>r.title==='Léo Moreau').id});assert.equal(JSON.parse(fetched.text).name,'Léo Moreau');
 for(const args of [{projectId:'secret',chapterId:'hidden-chapter'},{projectId:'other-account',chapterId:'ch1'}])assert.equal((await mcp.callTool({name:'read_chapter',arguments:args})).isError,true);
 assert.deepEqual((await tool(mcp,'search',{query:'SECRET INACCESSIBLE'})).results,[]);
 assert.equal((await f.request('/api/library',{headers:{Authorization:'Bearer '+tokens.access_token}})).status,401);
 assert.equal((await f.request('/api/library',{method:'PUT',headers:{Authorization:'Bearer '+tokens.access_token},body:{data:initial,revision:1}})).status,401);
 assert.equal((await mcp.callTool({name:'delete_project',arguments:{projectId:'meridian'}})).isError,true);
 const grants=(await(await f.request('/api/mcp/connections',{cookie:owner.cookie})).json()).connections;
 assert.equal((await f.request('/api/mcp/connections/'+grants[0].id,{method:'DELETE',cookie:other.cookie})).status,404);
 assert.deepEqual((await(await f.request('/api/mcp/connections',{cookie:other.cookie})).json()).connections,[]);
});

test('MCP : consentement explicite, sélection propriétaire, liaison navigateur, refus et usage unique',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),flow=await f.begin(client),path='/api/mcp/authorization/'+flow.requestId,cookie=owner.cookie+'; '+flow.browser;
 assert.equal((await f.request(path,{cookie:owner.cookie})).status,400);
 const details=await(await f.request(path,{cookie})).json();assert.equal(details.projects.length,2);assert.equal(details.redirectUri,callback);
 for(const body of [{projectIds:['meridian']},{projectIds:[],sharingAccepted:true},{projectIds:['not-owned'],sharingAccepted:true},{projectIds:['meridian','meridian'],sharingAccepted:true}])assert.equal((await f.request(path,{method:'POST',cookie,body})).status,400);
 assert.equal((await f.request(path,{method:'POST',cookie,headers:{Origin:'https://evil.example'},body:{projectIds:['meridian'],sharingAccepted:true}})).status,403);
 const denied=await f.request(path,{method:'POST',cookie,body:{deny:true}});assert.equal(denied.status,200);const redirect=new URL((await denied.json()).redirect);assert.equal(redirect.searchParams.get('error'),'access_denied');assert.equal(redirect.searchParams.get('state'),'test-state');
 assert.equal((await f.request(path,{cookie})).status,400);assert.equal((await f.app.db.query('SELECT * FROM mcp_grants')).rowCount,0);
 const expired=await f.begin(client);f.advance(11*60000);assert.equal((await f.request('/api/mcp/authorization/'+expired.requestId,{cookie:owner.cookie+'; '+expired.browser})).status,400);
});

test('MCP : retours exacts, scopes, PKCE, client, redirection et audience vérifiés',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),other=await f.register();
 for(const uri of ['https://evil.example/callback',callback+'/extra','https://chatgpt.com.evil.example/connector_platform_oauth_redirect'])assert.equal((await f.request('/register',{method:'POST',body:{redirect_uris:[uri]}})).status,400);
 assert.equal((await f.begin(client,{redirect_uri:'https://evil.example/callback'})).r.status,400);
 for(const params of [{code_challenge_method:'plain'},{code_challenge:'short'},{scope:'atlas:write'},{resource:'https://evil.example/mcp'},{state:''}]){const flow=await f.begin(client,params);assert.ok([302,400].includes(flow.r.status));assert.ok(!flow.requestId);}
 const flow=await f.approve(client,owner);
 for(const extra of [{code_verifier:'a'.repeat(43)},{client_id:other.client_id},{redirect_uri:callback+'/extra'},{resource:'https://evil.example/mcp'}])assert.equal((await f.redeem(client,flow,extra)).status,400);
 const r=await f.redeem(client,flow);assert.equal(r.status,200);assert.equal((await f.redeem(client,flow)).status,400);
 const tokens=await r.json();assert.equal((await f.app.db.query('SELECT * FROM mcp_tokens WHERE access_hash=$1 AND refresh_hash=$2',[hash(tokens.access_token),hash(tokens.refresh_token)])).rowCount,1);
 const expired=await f.approve(client,owner);f.advance(6*60000);assert.equal((await f.redeem(client,expired)).status,400);
});

test('MCP : clients confidentiels utilisables sans stocker le secret brut',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register({token_endpoint_auth_method:'client_secret_post'}),flow=await f.approve(client,owner);
 assert.ok(client.client_secret);const stored=(await f.app.db.query('SELECT metadata FROM mcp_clients WHERE client_id=$1',[client.client_id])).rows[0].metadata;assert.equal(stored.client_secret,hash(client.client_secret));
 assert.equal((await f.redeem(client,flow,{client_secret:'wrong'})).status,400);
 assert.equal((await f.redeem(client,flow,{client_secret:stored.client_secret})).status,400);
 assert.equal((await f.redeem(client,flow)).status,200);
});

test('MCP : changement de projets et révocation effectifs sur une connexion ouverte',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),tokens=await f.tokens(client,owner),mcp=await f.connect(tokens.access_token);
 const grant=(await(await f.request('/api/mcp/connections',{cookie:owner.cookie})).json()).connections[0],path='/api/mcp/connections/'+grant.id;
 assert.equal((await f.request(path,{method:'PUT',cookie:owner.cookie,body:{projectIds:['secret'],sharingAccepted:false}})).status,400);
 assert.equal((await f.request(path,{method:'PUT',cookie:owner.cookie,body:{projectIds:['secret'],sharingAccepted:true}})).status,200);
 assert.deepEqual((await tool(mcp,'list_projects')).items.map(p=>p.id),['secret']);assert.equal((await mcp.callTool({name:'get_entity',arguments:{projectId:'meridian',entityId:'cassie'}})).isError,true);
 assert.equal((await f.request(path,{method:'DELETE',cookie:owner.cookie})).status,200);assert.equal((await f.rpc(tokens.access_token)).status,401);
 assert.equal((await f.request('/token',{method:'POST',form:{grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token}})).status,400);
});

test('MCP : expiration, rotation et détection du rejeu des jetons de renouvellement',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),tokens=await f.tokens(client,owner);
 f.advance(16*60000);assert.equal((await f.rpc(tokens.access_token)).status,401);
 const refresh=token=>f.request('/token',{method:'POST',form:{grant_type:'refresh_token',client_id:client.client_id,refresh_token:token,resource:origin+'/mcp'}});
 const r=await refresh(tokens.refresh_token);assert.equal(r.status,200);const next=await r.json();assert.notEqual(next.refresh_token,tokens.refresh_token);assert.equal((await f.rpc(next.access_token)).status,200);
 assert.equal((await refresh(tokens.refresh_token)).status,400);assert.equal((await f.rpc(next.access_token)).status,401);assert.equal((await refresh(next.refresh_token)).status,400);
 const fresh=await f.tokens(client,owner);f.advance(31*86400000);assert.equal((await refresh(fresh.refresh_token)).status,400);
});

test('MCP : révocation OAuth et suppression d’un projet excluent ses données',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),tokens=await f.tokens(client,owner),mcp=await f.connect(tokens.access_token);
 const data={projects:[fixtures().projects[1]],active:'secret'};assert.equal((await f.request('/api/library',{method:'PUT',cookie:owner.cookie,body:{data,revision:1}})).status,200);
 assert.deepEqual((await tool(mcp,'list_projects')).items,[]);assert.equal((await mcp.callTool({name:'read_chapter',arguments:{projectId:'meridian',chapterId:'ch1'}})).isError,true);
 assert.equal((await f.request('/revoke',{method:'POST',form:{client_id:client.client_id,token:tokens.access_token}})).status,200);assert.equal((await f.rpc(tokens.access_token)).status,401);
});

test('MCP : désactivé sans configuration, HTTPS requis en production',async t=>{
 const f=await setup(t,{mcpRedirectUris:''}),owner=await f.account();assert.equal((await f.request('/mcp')).status,503);assert.equal((await(await f.request('/api/mcp/connections',{cookie:owner.cookie})).json()).enabled,false);
 assert.equal(mcpConfiguration({appOrigin:'http://atlas.example',production:true,redirectUris:callback}),null);
 assert.equal(mcpConfiguration({appOrigin:'https://atlas.example',production:true,redirectUris:'https://chatgpt.com/callback#bad'}),null);
 assert.equal(mcpConfiguration({appOrigin:'https://atlas.example',production:true,redirectUris:'http://localhost/callback'}),null);
 assert.ok(mcpConfiguration({appOrigin:'https://atlas.example',production:true,redirectUris:callback}));
});

test('MCP : autorisations, clients et révocations conservés après redémarrage',async t=>{
 const f=await setup(t),owner=await f.account(),client=await f.register(),tokens=await f.tokens(client,owner);
 await new Promise(r=>f.app.server.close(r));await f.app.db.close();
 const app=await createApp({...f.database,appOrigin:origin,mcpRedirectUris:callback,oauthEnv:{}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 t.after(async()=>{await new Promise(r=>app.server.close(r));await app.db.close();});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const mcp=new Client({name:'atlas-restart-test',version:'1'});t.after(()=>mcp.close());
 await mcp.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}}));
 assert.deepEqual((await tool(mcp,'list_projects')).items.map(p=>p.id),['meridian']);
 const grants=await(await fetch(base+'/api/mcp/connections',{headers:{Cookie:owner.cookie}})).json();assert.equal(grants.connections.length,1);
 assert.equal((await fetch(base+'/api/mcp/connections/'+grants.connections[0].id,{method:'DELETE',headers:{Cookie:owner.cookie}})).status,200);
 assert.equal((await mcp.callTool({name:'read_chapter',arguments:{projectId:'meridian',chapterId:'ch1'}}).then(()=>false,()=>true)),true);
});
