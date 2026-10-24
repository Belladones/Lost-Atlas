import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {InvalidClientMetadataError,InvalidGrantError,InvalidRequestError,InvalidScopeError,InvalidTargetError,InvalidTokenError} from '@modelcontextprotocol/sdk/server/auth/errors.js';

export const MCP_SCOPE='atlas:read';
export const hash=value=>createHash('sha256').update(value).digest('hex');
const opaque=()=>randomBytes(32).toString('base64url');
const MINUTE=60000,DAY=86400000;
const cookieValue=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('atlas_mcp_browser='))?.slice(18);
const selectionSchema=z.object({projectIds:z.array(z.string().min(1).max(100)).min(1).max(100),sharingAccepted:z.literal(true)}).strict();
const invalidGrant=()=>new InvalidGrantError('Autorisation expirée, révoquée ou invalide. Reconnectez Lost Atlas.');

export function mcpConfiguration({appOrigin,production,redirectUris}){
 try{
  const origin=new URL(appOrigin);
  if(origin.origin!==appOrigin||origin.username||origin.password)return null;
  const local=!production&&['localhost','127.0.0.1'].includes(origin.hostname);
  if(origin.protocol!=='https:'&&!(local&&origin.protocol==='http:'))return null;
  const callbacks=[...new Set(redirectUris.split(',').map(s=>s.trim()).filter(Boolean))];
  if(!callbacks.length||callbacks.length>20)return null;
  for(const callback of callbacks){
   const url=new URL(callback);
   if(url.username||url.password||url.hash||url.search||url.href!==callback)return null;
   if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;
  }
  return {origin:origin.origin,resource:origin.origin+'/mcp',callbacks,secure:origin.protocol==='https:'};
 }catch{return null;}
}

// OAuth grants and every token are scoped to a single account and an explicit
// project selection. Nothing here accepts an account ID supplied by the client.
export function createMcpProvider({db,config,now}){
 const browserCookie=token=>`atlas_mcp_browser=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${config.secure?'; Secure':''}`;
 const allowedClient=client=>client.redirect_uris.every(uri=>config.callbacks.includes(uri));
 const validResource=resource=>{if(resource&&resource.href!==config.resource)throw new InvalidTargetError('Ressource MCP incorrecte.');};
 const validScopes=scopes=>{if(scopes?.some(scope=>scope!==MCP_SCOPE))throw new InvalidScopeError('Seule la lecture atlas:read est disponible.');};
 const clientsStore={
  async getClient(id){
   if(typeof id!=='string'||id.length>200)return undefined;
   const client=(await db.query('SELECT metadata FROM mcp_clients WHERE client_id=$1',[id])).rows[0]?.metadata;
   return client&&allowedClient(client)?client:undefined;
  },
  async registerClient(client){
   if(!client.redirect_uris.length||!allowedClient(client))throw new InvalidClientMetadataError('URI de retour absente de MCP_REDIRECT_URIS.');
   if(client.grant_types?.some(type=>!['authorization_code','refresh_token'].includes(type))||client.response_types?.some(type=>type!=='code'))throw new InvalidClientMetadataError('Seul le parcours authorization_code avec PKCE est disponible.');
   if(client.token_endpoint_auth_method&&!['none','client_secret_post'].includes(client.token_endpoint_auth_method))throw new InvalidClientMetadataError('Méthode client non prise en charge.');
   if(client.scope)validScopes(client.scope.split(' '));
   const registered={...client,client_name:'ChatGPT',scope:MCP_SCOPE,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:client.token_endpoint_auth_method||'client_secret_post'};
   // The SDK compares secrets itself. The HTTP adapter hashes submitted client
   // secrets before authentication so the database never retains the raw secret.
   const stored={...registered,...(registered.client_secret?{client_secret:hash(registered.client_secret)}:{})};
   await db.query('INSERT INTO mcp_clients VALUES ($1,$2,$3)',[registered.client_id,JSON.stringify(stored),now()]);
   return registered;
  },
 };
 async function codeFor(client,code){
  if(typeof code!=='string'||code.length>200)throw invalidGrant();
  const row=(await db.query('SELECT c.* FROM mcp_codes c JOIN mcp_grants g ON g.id=c.grant_id WHERE c.code_hash=$1 AND g.client_id=$2 AND g.revoked_at IS NULL AND g.expires_at>$3 AND c.expires_at>$3',[hash(code),client.client_id,now()])).rows[0];
  if(!row)throw invalidGrant();return row;
 }
 async function issueTokens(grantId,grantExpiry){
  const access=opaque(),refresh=opaque(),expiry=Math.min(now()+15*MINUTE,Number(grantExpiry));
  await db.query('INSERT INTO mcp_tokens VALUES ($1,$2,$3,$4,$5,NULL)',[hash(access),hash(refresh),grantId,expiry,grantExpiry]);
  return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:Math.max(1,Math.floor((expiry-now())/1000)),scope:MCP_SCOPE};
 }
 const provider={
  clientsStore,
  async authorize(client,params,res){
   validScopes(params.scopes);validResource(params.resource);
   if(!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))throw new InvalidRequestError('PKCE S256 requis.');
   if(!params.state||params.state.length>512)throw new InvalidRequestError('Un état OAuth est requis (512 caractères maximum).');
   if(params.redirectUri.length>2048)throw new InvalidRequestError('URI de retour trop longue.');
   let browser=cookieValue(res.req);if(!/^[A-Za-z0-9_-]{43}$/.test(browser||''))browser=opaque();
   const request=opaque();
   await db.query('DELETE FROM mcp_requests WHERE expires_at<=$1',[now()]);
   await db.query('DELETE FROM mcp_codes WHERE expires_at<=$1',[now()]);
   const parameters={redirectUri:params.redirectUri,state:params.state,challenge:params.codeChallenge,resource:config.resource};
   await db.query('INSERT INTO mcp_requests VALUES ($1,$2,$3,$4,$5)',[hash(request),hash(browser),client.client_id,JSON.stringify(parameters),now()+10*MINUTE]);
   res.setHeader('Set-Cookie',browserCookie(browser));
   res.redirect(303,config.origin+'/?mcp_authorization='+encodeURIComponent(request));
  },
  async challengeForAuthorizationCode(client,code){return (await codeFor(client,code)).challenge;},
  async exchangeAuthorizationCode(client,code,_verifier,redirectUri,resource){
   validResource(resource);
   return db.transaction(async()=>{
    const found=await codeFor(client,code);
    if(redirectUri!==found.redirect_uri)throw invalidGrant();
    // Deletion makes code redemption atomic, including across server instances.
    const row=(await db.query('DELETE FROM mcp_codes WHERE code_hash=$1 RETURNING grant_id',[hash(code)])).rows[0];
    if(!row)throw invalidGrant();
    const grant=(await db.query('SELECT * FROM mcp_grants WHERE id=$1 AND revoked_at IS NULL AND expires_at>$2 FOR UPDATE',[row.grant_id,now()])).rows[0];
    if(!grant)throw invalidGrant();
    return issueTokens(grant.id,grant.expires_at);
   });
  },
  async exchangeRefreshToken(client,refresh,scopes,resource){
   validScopes(scopes);validResource(resource);
   if(typeof refresh!=='string'||refresh.length>200)throw invalidGrant();
   const result=await db.transaction(async()=>{
    const token=(await db.query('SELECT t.*,g.expires_at,g.revoked_at FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id WHERE t.refresh_hash=$1 AND g.client_id=$2 FOR UPDATE OF t,g',[hash(refresh),client.client_id])).rows[0];
    if(!token||token.revoked_at!==null||Number(token.expires_at)<=now()||Number(token.refresh_expires_at)<=now())return null;
    if(token.used_at!==null){
     // A replay invalidates the entire connection, including its newest token.
     await db.query('UPDATE mcp_grants SET revoked_at=$1 WHERE id=$2',[now(),token.grant_id]);return null;
    }
    await db.query('UPDATE mcp_tokens SET used_at=$1 WHERE access_hash=$2',[now(),token.access_hash]);
    return issueTokens(token.grant_id,token.expires_at);
   });
   if(!result)throw invalidGrant();return result;
  },
  async verifyAccessToken(token){
   if(typeof token!=='string'||token.length>200)throw new InvalidTokenError('Jeton MCP invalide.');
   const grant=(await db.query('SELECT g.id,g.user_id,g.client_id,g.project_ids,t.access_expires_at FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id WHERE t.access_hash=$1 AND t.used_at IS NULL AND t.access_expires_at>$2 AND g.revoked_at IS NULL AND g.expires_at>$2',[hash(token),now()])).rows[0];
   if(!grant||!await clientsStore.getClient(grant.client_id))throw new InvalidTokenError('Connexion expirée ou révoquée.');
   return {token,clientId:grant.client_id,scopes:[MCP_SCOPE],expiresAt:Number(grant.access_expires_at)/1000,resource:new URL(config.resource),extra:{grantId:grant.id,userId:grant.user_id,projectIds:grant.project_ids}};
  },
  async revokeToken(client,{token}){
   if(typeof token!=='string'||token.length>200)return;
   await db.query('UPDATE mcp_grants SET revoked_at=$1 WHERE client_id=$2 AND id IN (SELECT grant_id FROM mcp_tokens WHERE access_hash=$3 OR refresh_hash=$3)',[now(),client.client_id,hash(token)]);
  },
 };
 async function pending(req,id){
  const browser=cookieValue(req);
  if(!browser||browser.length>200||id.length>200)throw {status:400,message:'Demande de connexion expirée ou ouverte dans un autre navigateur. Recommencez depuis ChatGPT.'};
  const row=(await db.query('SELECT * FROM mcp_requests WHERE id_hash=$1 AND browser_hash=$2 AND expires_at>$3',[hash(id),hash(browser),now()])).rows[0];
  if(!row||!await clientsStore.getClient(row.client_id))throw {status:400,message:'Demande de connexion expirée. Recommencez depuis ChatGPT.'};
  return row;
 }
 async function projects(userId){return (await db.query('SELECT body FROM libraries WHERE user_id=$1',[userId])).rows[0].body.projects;}
 async function selection(userId,input){
  const parsed=selectionSchema.safeParse(input);
  if(!parsed.success)throw {status:400,message:'Choisissez au moins un projet et acceptez explicitement le partage avec OpenAI.'};
  const ids=parsed.data.projectIds,owned=new Set((await projects(userId)).map(p=>p.id));
  if(new Set(ids).size!==ids.length||ids.some(id=>!owned.has(id)))throw {status:400,message:'Sélection de projets invalide.'};
  return ids;
 }
 async function authorization(req,user,id,input){
  const request=await pending(req,id);
  if(req.method==='GET')return {projects:(await projects(user.id)).map(p=>({id:p.id,name:p.name})),clientName:'ChatGPT',redirectUri:request.parameters.redirectUri,expiresAt:Number(request.expires_at)};
  const denied=z.object({deny:z.literal(true)}).strict().safeParse(input);
  const ids=denied.success?[]:await selection(user.id,input);
  return db.transaction(async()=>{
   const consumed=await db.query('DELETE FROM mcp_requests WHERE id_hash=$1 AND browser_hash=$2 AND expires_at>$3 RETURNING id_hash',[request.id_hash,request.browser_hash,now()]);
   if(!consumed.rowCount)throw {status:400,message:'Cette demande a déjà été traitée ou a expiré.'};
   const redirect=new URL(request.parameters.redirectUri);redirect.searchParams.set('state',request.parameters.state);
   if(denied.success){redirect.searchParams.set('error','access_denied');return {redirect:redirect.href};}
   const id=randomUUID(),code=opaque();
   await db.query('INSERT INTO mcp_grants VALUES ($1,$2,$3,$4,$5,$6,NULL)',[id,user.id,request.client_id,JSON.stringify(ids),now(),now()+30*DAY]);
   await db.query('INSERT INTO mcp_codes VALUES ($1,$2,$3,$4,$5,$6)',[hash(code),id,request.parameters.challenge,request.parameters.redirectUri,config.resource,now()+5*MINUTE]);
   redirect.searchParams.set('code',code);return {redirect:redirect.href};
  });
 }
 return {provider,authorization,selection,projects};
}
