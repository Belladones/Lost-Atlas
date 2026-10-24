import express from 'express';
import {mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {requireBearerAuth} from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpProvider,mcpConfiguration,MCP_SCOPE,hash} from './mcp-auth.js';
import {createAtlasMcpServer} from './mcp-tools.js';

const publicPaths=new Set(['/mcp','/authorize','/token','/register','/revoke','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource/mcp']);

export function createMcp({db,appOrigin,production,now,json,body,redirectUris}){
 const config=mcpConfiguration({appOrigin,production,redirectUris});
 const {provider,authorization,selection}=createMcpProvider({db,config:config||{callbacks:[]},now});
 const router=express();router.disable('x-powered-by');
 if(config){
  const origin=new URL(config.origin),allowedOrigins=new Set([config.origin,...config.callbacks.map(uri=>new URL(uri).origin)]);
  router.use((req,res,next)=>{
   // The public origin is configured, never inferred from forwarded headers.
   // Reverse proxies must preserve Host. Local development may use another port.
   let host;try{host=new URL('http://'+req.headers.host);}catch{}
   const local=!production&&origin.protocol==='http:';
   if(!host||(local?host.hostname!==origin.hostname:host.host!==origin.host))return json(res,403,{error:'Hôte MCP non autorisé.'});
   if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origine MCP non autorisée.'});
   res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
   next();
  });
  // Hash submitted client secrets before the SDK compares them to persisted hashes.
  router.use(['/token','/revoke'],express.urlencoded({extended:false,limit:'8kb'}),(req,_res,next)=>{if(typeof req.body?.client_secret==='string')req.body.client_secret=hash(req.body.client_secret);next();});
  router.use(mcpAuthRouter({provider,issuerUrl:new URL(config.origin),resourceServerUrl:new URL(config.resource),scopesSupported:[MCP_SCOPE],resourceName:'Lost Atlas — projets autorisés en lecture seule',clientRegistrationOptions:{clientSecretExpirySeconds:0}}));
  router.use('/mcp',(req,res,next)=>{
   if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept, MCP-Protocol-Version');
   res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
   res.setHeader('Access-Control-Expose-Headers','WWW-Authenticate');
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}next();
  },requireBearerAuth({verifier:provider,requiredScopes:[MCP_SCOPE],resourceMetadataUrl:config.origin+'/.well-known/oauth-protected-resource/mcp',expectedResource:new URL(config.resource)}),express.json({limit:'16kb'}),async(req,res,next)=>{
   if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return json(res,405,{error:'Le connecteur utilise des requêtes MCP POST sans session persistante.'});}
   const server=createAtlasMcpServer({db,provider,token:req.auth.token,origin:config.origin});
   const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   const close=()=>{server.close().catch(()=>{});};res.once('close',close);
   try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch(error){next(error);}
  });
  router.use((error,_req,res,_next)=>{
   const status=error.status===413?413:error.type==='entity.parse.failed'?400:500;
   if(!res.headersSent)json(res,status,{error:status===413?'Requête MCP trop volumineuse.':status===400?'JSON invalide.':'Erreur du connecteur. Réessayez.'});else res.end();
  });
 }
 async function handlePublic(req,res,path){
  if(!publicPaths.has(path.replace(/\/$/,'')))return false;
  if(!config){json(res,503,{error:'Le connecteur nécessite APP_ORIGIN et MCP_REDIRECT_URIS. Consultez la documentation.'});return true;}
  await new Promise((resolve,reject)=>{
   res.once('finish',resolve);res.once('close',resolve);
   router(req,res,error=>{if(error)reject(error);else{json(res,404,{error:'Route MCP inconnue.'});resolve();}});
  });return true;
 }
 async function handleAccount(req,res,path,user){
  if(!path.startsWith('/api/mcp/'))return false;
  if(path==='/api/mcp/connections'&&req.method==='GET'){
   const grants=(await db.query('SELECT id,project_ids,created_at,expires_at FROM mcp_grants WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>$2 ORDER BY created_at DESC',[user.id,now()])).rows;
   const projects=(await db.query('SELECT body FROM libraries WHERE user_id=$1',[user.id])).rows[0].body.projects.map(p=>({id:p.id,name:p.name}));
   json(res,200,{enabled:!!config,endpoint:config?.resource||null,projects,connections:grants.map(g=>({id:g.id,projectIds:g.project_ids,createdAt:Number(g.created_at),expiresAt:Number(g.expires_at)}))});return true;
  }
  const consent=path.match(/^\/api\/mcp\/authorization\/([A-Za-z0-9_-]{43})$/);
  if(consent&&['GET','POST'].includes(req.method)){
   if(!config){json(res,503,{error:'Le connecteur est désactivé.'});return true;}
   json(res,200,await authorization(req,user,consent[1],req.method==='POST'?await body(req):undefined));return true;
  }
  const grant=path.match(/^\/api\/mcp\/connections\/([a-f0-9-]{36})$/);
  if(grant&&['PUT','DELETE'].includes(req.method)){
   if(req.method==='DELETE'){
    const changed=await db.query('UPDATE mcp_grants SET revoked_at=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL',[now(),grant[1],user.id]);
    json(res,changed.rowCount?200:404,changed.rowCount?{ok:true}:{error:'Connexion introuvable.'});return true;
   }
   const ids=await selection(user.id,await body(req));
   const changed=await db.query('UPDATE mcp_grants SET project_ids=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>$4',[JSON.stringify(ids),grant[1],user.id,now()]);
   json(res,changed.rowCount?200:404,changed.rowCount?{ok:true}:{error:'Connexion introuvable.'});return true;
  }
  json(res,404,{error:'Route de connexion inconnue.'});return true;
 }
 return {handlePublic,handleAccount};
}
