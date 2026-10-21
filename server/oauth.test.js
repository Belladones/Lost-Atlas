import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';

async function fixture(t){
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
 const env={GOOGLE_CLIENT_ID:'test-google',GOOGLE_CLIENT_SECRET:'not-a-real-secret'};
 let nonce='',provider='google',subject='identity-1',email='identity@example.test',verified=true,badSignature=false,time=Date.now(),tokenCalls=0,audience,issuer,expired=false;
 const oauthFetch=async(url,options)=>{
  if(String(url).endsWith('/certs')||String(url).endsWith('/keys'))return Response.json({keys:[jwk]});
  assert.ok(String(url).includes('/token'));tokenCalls++;
  const params=new URLSearchParams(String(options.body));assert.equal(params.get('client_id'),env.GOOGLE_CLIENT_ID);assert.ok(params.get('client_secret'));
  if(provider==='google')assert.ok(params.get('code_verifier')?.length>=43);
  const key=badSignature?(await generateKeyPair('RS256')).privateKey:privateKey;
  const idToken=await new SignJWT({email,email_verified:verified,name:'Auteur OAuth',nonce}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer||'https://accounts.google.com').setAudience(audience||env.GOOGLE_CLIENT_ID).setSubject(subject).setIssuedAt().setExpirationTime(expired?Math.floor(Date.now()/1000)-600:'5m').sign(key);
  return Response.json({access_token:'test-access',token_type:'Bearer',expires_in:300,id_token:idToken});
 };
 const app=await createApp({...await testDatabase(t),appOrigin:'https://atlas.example.test',production:true,oauthEnv:env,oauthFetch,now:()=>time});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(resolve=>app.server.close(resolve)));const base=`http://127.0.0.1:${app.server.address().port}`;
 async function begin(which='google'){
  provider=which;const r=await fetch(base+'/api/auth/oauth/'+which,{redirect:'manual'});assert.equal(r.status,303);const url=new URL(r.headers.get('location'));nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('redirect_uri'),'https://atlas.example.test/api/auth/oauth/'+which+'/callback');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  return {state:url.searchParams.get('state'),cookie:r.headers.get('set-cookie').split(';')[0],provider:which};
 }
 async function finish(flow,{cookie=flow.cookie,state=flow.state,error}={}){
  const params=new URLSearchParams({state,...(error?{error}:{code:'authorization-code'})});return fetch(base+'/api/auth/oauth/google/callback?'+params,{redirect:'manual',headers:{Cookie:cookie}});
 }
 const sessionCookie=r=>r.headers.getSetCookie().find(c=>c.startsWith('atlas_session='))?.split(';')[0];
 return {...app,base,begin,finish,sessionCookie,set(values){({nonce=nonce,subject=subject,email=email,verified=verified,badSignature=badSignature,audience=audience,issuer=issuer,expired=expired}=values);if(values.advance)time+=values.advance;},get tokenCalls(){return tokenCalls;}};
}
test('Google : code, PKCE, signature, session, bibliothèque vide et connexion répétée',async t=>{
 const f=await fixture(t);assert.deepEqual(await(await fetch(f.base+'/api/auth/providers')).json(),{google:true});
 const flow=await f.begin(),r=await f.finish(flow);assert.equal(r.headers.get('location'),'/');const cookie=f.sessionCookie(r);assert.ok(cookie);
 const library=await fetch(f.base+'/api/library',{headers:{Cookie:cookie}});assert.deepEqual(await library.json(),{data:{projects:[],active:null},revision:0});
 const again=await f.finish(await f.begin());assert.equal(again.headers.get('location'),'/');assert.equal((await f.db.query('SELECT * FROM users')).rowCount,1);assert.equal((await f.db.query('SELECT * FROM oauth_identities')).rowCount,1);
 assert.equal((await f.finish(flow)).headers.get('location'),'/?authError=failed');
});
test('refuse state, cookie, nonce, signature, email non vérifié et flux expiré',async t=>{
 const f=await fixture(t);
 let flow=await f.begin();assert.equal((await f.finish(flow,{state:'forged-state'})).headers.get('location'),'/?authError=failed');assert.equal(f.tokenCalls,0);
 assert.equal((await f.finish(flow,{cookie:'atlas_oauth_google=wrong-browser'})).headers.get('location'),'/?authError=failed');assert.equal(f.tokenCalls,0);
 flow=await f.begin();f.set({nonce:'wrong-nonce'});assert.equal((await f.finish(flow)).headers.get('location'),'/?authError=failed');
 flow=await f.begin();f.set({badSignature:true});assert.equal((await f.finish(flow)).headers.get('location'),'/?authError=failed');
 f.set({badSignature:false,verified:false});flow=await f.begin();assert.equal((await f.finish(flow)).headers.get('location'),'/?authError=failed');
 f.set({verified:true});flow=await f.begin();f.set({advance:600001});const before=f.tokenCalls;assert.equal((await f.finish(flow)).headers.get('location'),'/?authError=failed');assert.equal(f.tokenCalls,before);
 assert.equal((await f.db.query('SELECT * FROM users')).rowCount,0);
});
test('Apple est retiré et les comptes Google ne peuvent pas modifier leur mot de passe localement',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.base+'/api/auth/oauth/apple',{redirect:'manual'})).status,401);const r=await f.finish(await f.begin()),cookie=f.sessionCookie(r);const me=await(await fetch(f.base+'/api/auth/me',{headers:{Cookie:cookie}})).json();assert.equal(me.user.canChangePassword,false);assert.equal((await fetch(f.base+'/api/account/password',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:'anything',newPassword:'a new password 123'})})).status,403);
});
test('ne fusionne jamais automatiquement un compte email et une identité Google',async t=>{
 const f=await fixture(t);const registered=await fetch(f.base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Auteur existant',email:'identity@example.test',password:'existing account password 123'})});assert.equal(registered.status,200);
 const r=await f.finish(await f.begin());assert.equal(r.headers.get('location'),'/?authError=account_exists');assert.equal((await f.db.query('SELECT * FROM oauth_identities')).rowCount,0);assert.equal((await f.db.query('SELECT * FROM users')).rowCount,1);
});
test('une annulation est récupérable et ne crée pas de compte',async t=>{
 const f=await fixture(t);assert.equal((await f.finish(await f.begin(),{error:'access_denied'})).headers.get('location'),'/?authError=cancelled');assert.equal(f.tokenCalls,0);
});

test('refuse une audience, un émetteur ou une expiration de jeton invalides',async t=>{
 const f=await fixture(t);
 for(const overrides of [{audience:'another-application'},{audience:null,issuer:'https://untrusted.example.test'},{issuer:null,expired:true}]){f.set(overrides);assert.equal((await f.finish(await f.begin())).headers.get('location'),'/?authError=failed');}
 assert.equal((await f.db.query('SELECT * FROM users')).rowCount,0);
});
