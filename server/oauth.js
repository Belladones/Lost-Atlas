import * as oidc from 'openid-client';
import {SignJWT,importPKCS8} from 'jose';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {credentialsSchema} from '../shared/schema.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const metadata={
 google:{issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/o/oauth2/v2/auth',token_endpoint:'https://oauth2.googleapis.com/token',jwks_uri:'https://www.googleapis.com/oauth2/v3/certs',id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']},
 apple:{issuer:'https://appleid.apple.com',authorization_endpoint:'https://appleid.apple.com/auth/authorize',token_endpoint:'https://appleid.apple.com/auth/token',jwks_uri:'https://appleid.apple.com/auth/keys',id_token_signing_alg_values_supported:['RS256']}
};
const readCookie=(req,name)=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
export function createOAuth({db,appOrigin,production,now,openSession,json,env=process.env,fetch=globalThis.fetch}){
 let origin;
 try{const url=new URL(appOrigin);if(url.origin===appOrigin&&(url.protocol==='https:'||(!production&&url.protocol==='http:')))origin=url.origin;}catch{}
 const enabled={google:!!(origin&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),apple:!!(origin?.startsWith('https:')&&env.APPLE_CLIENT_ID&&env.APPLE_TEAM_ID&&env.APPLE_KEY_ID&&env.APPLE_PRIVATE_KEY)};
 const callback=provider=>origin+`/api/auth/oauth/${provider}/callback`;
 const flowCookie=(provider,token,maxAge=600)=>`atlas_oauth_${provider}=${token}; Path=/api/auth/oauth/${provider}; HttpOnly; SameSite=${provider==='apple'?'None':'Lax'}; Max-Age=${maxAge}${production||origin?.startsWith('https:')?'; Secure':''}`;
 const redirect=(res,path)=>{res.writeHead(303,{Location:path,'Cache-Control':'no-store'});res.end();};
 const rate=new Map();
 async function configuration(provider){
  let secret=env.GOOGLE_CLIENT_SECRET;
  if(provider==='apple'){
   const key=await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n'),'ES256');
   secret=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:env.APPLE_KEY_ID}).setIssuer(env.APPLE_TEAM_ID).setSubject(env.APPLE_CLIENT_ID).setAudience(metadata.apple.issuer).setIssuedAt().setExpirationTime('1h').sign(key);
  }
  const config=new oidc.Configuration(metadata[provider],provider==='google'?env.GOOGLE_CLIENT_ID:env.APPLE_CLIENT_ID,secret);
  config[oidc.customFetch]=fetch;config.timeout=10;oidc.enableNonRepudiationChecks(config);return config;
 }
 return async function handle(req,res,path){
  if(path==='/api/auth/providers'&&req.method==='GET'){json(res,200,enabled);return true;}
  const match=path.match(/^\/api\/auth\/oauth\/(google|apple)(\/callback)?$/);if(!match)return false;
  const [,provider,isCallback]=match;
  if(!enabled[provider]){json(res,503,{error:'Cette connexion n’est pas encore configurée.'});return true;}
  if(!isCallback){
   if(req.method!=='GET'){json(res,405,{error:'Méthode non autorisée.'});return true;}
   if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Origine non autorisée.'});return true;}
   const address=req.socket.remoteAddress;let bucket=rate.get(address);if(!bucket||bucket.until<now()){bucket={count:0,until:now()+900000};rate.set(address,bucket);}if(++bucket.count>20){json(res,429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});return true;}
   if(rate.size>10000)for(const [key,value]of rate)if(value.until<now())rate.delete(key);
   const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier(),browser=randomBytes(32).toString('hex');
   const config=await configuration(provider);
   await db.query('DELETE FROM oauth_flows WHERE expires_at<=$1',[now()]);
   await db.query('INSERT INTO oauth_flows VALUES ($1,$2,$3,$4,$5,$6)',[hash(state),provider,hash(browser),verifier,nonce,now()+600000]);
   const params={redirect_uri:callback(provider),scope:provider==='google'?'openid email profile':'openid email name',state,nonce};
   if(provider==='google'){params.code_challenge=await oidc.calculatePKCECodeChallenge(verifier);params.code_challenge_method='S256';}else params.response_mode='form_post';
   res.setHeader('Set-Cookie',flowCookie(provider,browser));redirect(res,oidc.buildAuthorizationUrl(config,params).href);return true;
  }
  if((provider==='google'&&req.method!=='GET')||(provider==='apple'&&req.method!=='POST')){json(res,405,{error:'Méthode non autorisée.'});return true;}
  try{
   let request,params;
   if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw Error('Invalid form');
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768)throw Error('Form too large');chunks.push(chunk);}
    const body=Buffer.concat(chunks).toString();params=new URLSearchParams(body);request=new Request(callback(provider),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
   }else{request=new URL(callback(provider)+new URL(req.url,origin).search);params=request.searchParams;}
   const state=params.get('state'),browser=readCookie(req,`atlas_oauth_${provider}`);
   if(!state||state.length>512||!browser||browser.length>128)throw Error('Missing state');
   const flow=(await db.query('DELETE FROM oauth_flows WHERE state_hash=$1 AND provider=$2 AND browser_hash=$3 AND expires_at>$4 RETURNING *',[hash(state),provider,hash(browser),now()])).rows[0];
   if(!flow)throw Error('Invalid state');
   res.setHeader('Set-Cookie',flowCookie(provider,'',0));
   if(params.has('error')){redirect(res,'/?authError=cancelled');return true;}
   const tokens=await oidc.authorizationCodeGrant(await configuration(provider),request,{expectedState:state,expectedNonce:flow.nonce,idTokenExpected:true,...(provider==='google'?{pkceCodeVerifier:flow.verifier}:{})});
   const claims=tokens.claims();if(!claims?.sub)throw Error('Missing subject');
   let accountExists=false;
   const user=await db.transaction(async()=>{
    // Serialize concurrent first sign-ins for the same provider identity.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[provider+':'+claims.sub]);
    const existing=(await db.query('SELECT users.id FROM oauth_identities JOIN users ON users.id=user_id WHERE provider=$1 AND subject=$2',[provider,claims.sub])).rows[0];
    if(existing)return existing;
    const email=credentialsSchema.shape.email.safeParse(claims.email);
    if(!email.success||![true,'true'].includes(claims.email_verified))throw Error('Verified email required');
    // Never merge accounts solely because an identity provider reports the same email.
    if((await db.query('SELECT id FROM users WHERE email=$1',[email.data])).rowCount){accountExists=true;return null;}
    let name=typeof claims.name==='string'?claims.name:'';
    if(provider==='apple'&&params.get('user')){try{const info=JSON.parse(params.get('user'));name=[info.name?.firstName,info.name?.lastName].filter(value=>typeof value==='string').join(' ');}catch{}}
    name=name.trim().slice(0,100)||'Auteur';const id=randomUUID();
    await db.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5)',[id,email.data,name,randomBytes(16).toString('hex')+':'+randomBytes(64).toString('hex'),now()]);
    await db.query('INSERT INTO libraries VALUES ($1,$2,0,$3)',[id,JSON.stringify({projects:[],active:null}),now()]);
    await db.query('INSERT INTO oauth_identities VALUES ($1,$2,$3)',[provider,claims.sub,id]);return {id};
   });
   if(accountExists){redirect(res,'/?authError=account_exists');return true;}
   // Keep both the expired flow cookie and the authenticated session cookie.
   const expired=res.getHeader('Set-Cookie');await openSession(res,user.id);res.setHeader('Set-Cookie',[expired,res.getHeader('Set-Cookie')]);redirect(res,'/');
  }catch(error){redirect(res,error.code==='23505'?'/?authError=account_exists':'/?authError=failed');}
  return true;
 };
}
