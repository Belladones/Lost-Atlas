import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {generateKeyPair,exportJWK,exportPKCS8,SignJWT,jwtVerify} from 'jose';
import {createApp} from './app.js';
import {testDatabase} from './test-database.js';

async function fixture(t){
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
 const appleKey=await generateKeyPair('ES256',{extractable:true});const env={GOOGLE_CLIENT_ID:'test-google',GOOGLE_CLIENT_SECRET:'not-a-real-secret',APPLE_CLIENT_ID:'test-apple',APPLE_TEAM_ID:'test-team',APPLE_KEY_ID:'test-key',APPLE_PRIVATE_KEY:await exportPKCS8(appleKey.privateKey)};
 let nonce='',provider='google',subject='identity-1',email='identity@example.test',verified=true,badSignature=false,time=Date.now(),tokenCalls=0,audience,issuer,expired=false;
 const oauthFetch=async(url,options)=>{
  if(String(url).endsWith('/certs')||String(url).endsWith('/keys'))return Response.json({keys:[jwk]});
  assert.ok(String(url).includes('/token'));tokenCalls++;
  const params=new URLSearchParams(String(options.body));assert.equal(params.get('client_id'),env[provider==='google'?'GOOGLE_CLIENT_ID':'APPLE_CLIENT_ID']);assert.ok(params.get('client_secret'));
  if(provider==='google')assert.ok(params.get('code_verifier')?.length>=43);
  else{const {payload,protectedHeader}=await jwtVerify(params.get('client_secret'),appleKey.publicKey,{issuer:'test-team',audience:'https://appleid.apple.com',subject:'test-apple'});assert.equal(protectedHeader.kid,'test-key');assert.ok(payload.exp-payload.iat<=3600);}
  const key=badSignature?(await generateKeyPair('RS256')).privateKey:privateKey;
  const idToken=await new SignJWT({email,email_verified:verified,name:'Auteur OAuth',nonce}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer||(provider==='google'?'https://accounts.google.com':'https://appleid.apple.com')).setAudience(audience||env[provider==='google'?'GOOGLE_CLIENT_ID':'APPLE_CLIENT_ID']).setSubject(subject).setIssuedAt().setExpirationTime(expired?Math.floor(Date.now()/1000)-600:'5m').sign(key);
  return Response.json({access_token:'test-access',token_type:'Bearer',expires_in:300,id_token:idToken});
 };
 const app=await createApp({...await testDatabase(t),appOrigin:'https://atlas.example.test',production:true,oauthEnv:env,oauthFetch,now:()=>time});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(resolve=>app.server.close(resolve)));const base=`http://127.0.0.1:${app.server.address().port}`;
 async function begin(which='google'){
  provider=which;const r=await fetch(base+'/api/auth/oauth/'+which,{redirect:'manual'});assert.equal(r.status,303);const url=new URL(r.headers.get('location'));nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('redirect_uri'),'https://atlas.example.test/api/auth/oauth/'+which+'/callback');if(which==='google')assert.equal(url.searchParams.get('code_challenge_method'),'S256');else{assert.equal(url.searchParams.get('response_mode'),'form_post');assert.match(r.headers.get('set-cookie'),/SameSite=None/);assert.match(r.headers.get('set-cookie'),/Secure/);}
  return {state:url.searchParams.get('state'),cookie:r.headers.get('set-cookie').split(';')[0],provider:which};
 }
 async function finish(flow,{cookie=flow.cookie,state=flow.state,error}={}){
  const params=new URLSearchParams({state,...(error?{error}:{code:'authorization-code'})});const apple=flow.provider==='apple';return fetch(base+'/api/auth/oauth/'+flow.provider+'/callback'+(apple?'':'?'+params),{method:apple?'POST':'GET',redirect:'manual',headers:{Cookie:cookie,...(apple?{'Content-Type':'application/x-www-form-urlencoded','Sec-Fetch-Site':'cross-site'}:{})},...(apple?{body:params.toString()}:{})});
 }
 const sessionCookie=r=>r.headers.getSetCookie().find(c=>c.startsWith('atlas_session='))?.split(';')[0];
 return {...app,base,begin,finish,sessionCookie,set(values){({nonce=nonce,subject=subject,email=email,verified=verified,badSignature=badSignature,audience=audience,issuer=issuer,expired=expired}=values);if(values.advance)time+=values.advance;},get tokenCalls(){return tokenCalls;}};
}
test('Google : code, PKCE, signature, session, bibliothèque vide et connexion répétée',async t=>{
 const f=await fixture(t);assert.deepEqual(await(await fetch(f.base+'/api/auth/providers')).json(),{google:true,apple:true});
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
test('Apple : retour form_post intersite lié au navigateur et cookie de session conservé',async t=>{
 const f=await fixture(t);const flow=await f.begin('apple');const r=await f.finish(flow);assert.equal(r.headers.get('location'),'/');assert.ok(f.sessionCookie(r));assert.equal(r.headers.getSetCookie().length,2);assert.equal((await f.db.query('SELECT provider FROM oauth_identities')).rows[0].provider,'apple');
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
