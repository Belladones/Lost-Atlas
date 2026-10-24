import sharp from 'sharp';
import {z} from 'zod';
import {settingsSchema,defaultSettings} from '../shared/settings.js';
import {createOAuth} from './oauth.js';
import {createMcp} from './mcp.js';
import {projectTheme} from './project-theme.js';
import {mediaIds} from '../shared/media.js';
import {createServer} from 'node:http';
import {createDatabase} from './database.js';
import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {credentialsSchema,librarySchema} from '../shared/schema.js';
const scrypt=promisify(scryptCallback);
const digest=s=>createHash('sha256').update(s).digest('hex');
const DAY=86400000;
export async function createApp({databaseUrl=process.env.DATABASE_URL,databaseUrlUnpooled=databaseUrl===process.env.DATABASE_URL?process.env.DATABASE_URL_UNPOOLED:undefined,schema,production=false,appOrigin,dist=resolve('dist'),now=Date.now,imageQuotaBytes=50*1024*1024,oauthEnv=process.env,oauthFetch=globalThis.fetch,themeImageLoader,mcpRedirectUris=process.env.MCP_REDIRECT_URIS||''}={}){
 const db=await createDatabase({connectionString:databaseUrl,migrationConnectionString:databaseUrlUnpooled,schema});
 const attempts=new Map();
 const cookie=(token,maxAge)=>`atlas_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production?'; Secure':''}`;
 async function session(req){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('atlas_session='))?.slice(14);if(!token)return null;return (await db.query('SELECT users.id,users.email,users.name,NOT EXISTS (SELECT 1 FROM oauth_identities WHERE user_id=users.id) AS "canChangePassword" FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=$1 AND expires_at>$2',[digest(token),now()])).rows[0];}
 async function openSession(res,userId){const token=randomBytes(32).toString('hex');await db.query('DELETE FROM sessions WHERE expires_at<=$1',[now()]);await db.query('INSERT INTO sessions VALUES ($1,$2,$3)',[digest(token),userId,now()+7*DAY]);res.setHeader('Set-Cookie',cookie(token,7*86400));}
 function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
 async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)throw {status:413,message:'Bibliothèque trop volumineuse (limite : 5 Mo).'};chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw {status:400,message:'JSON invalide.'};}}
 const handleOAuth=createOAuth({db,appOrigin,production,now,openSession,json,env:oauthEnv,fetch:oauthFetch});
 const mcp=createMcp({db,appOrigin,production,now,json,body,redirectUris:mcpRedirectUris});
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  try{
   const url=new URL(req.url,'http://localhost');const path=url.pathname;
   if(await mcp.handlePublic(req,res,path))return;
   if(path.startsWith('/api/')){
    if(await handleOAuth(req,res,path))return;
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
     if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Origine non autorisée.'});
     if(req.headers.origin){const expected=appOrigin||`${production?'https':'http'}://${req.headers.host}`;if(req.headers.origin!==expected)return json(res,403,{error:'Origine non autorisée.'});}
     if(req.method!=='DELETE'&&!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Content-Type application/json requis.'});
    }
    if(path==='/api/health'&&req.method==='GET'){await db.query('SELECT 1');return json(res,200,{status:'ok'});}
    if(['/api/auth/register','/api/auth/login'].includes(path)&&req.method==='POST'){
     const key=req.socket.remoteAddress;let bucket=attempts.get(key);if(!bucket||bucket.until<=now()){bucket={count:0,until:now()+15*60000};attempts.set(key,bucket);}if(++bucket.count>20){res.setHeader('Retry-After',Math.ceil((bucket.until-now())/1000));return json(res,429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});}
     if(attempts.size>10000)for(const [k,v]of attempts)if(v.until<=now())attempts.delete(k);
     const parsed=credentialsSchema.safeParse(await body(req));if(!parsed.success)return json(res,400,{error:'Indiquez un email valide et un mot de passe de 12 à 256 caractères.'});
     const {email,password,name}=parsed.data;let user=(await db.query('SELECT * FROM users WHERE email=$1',[email])).rows[0];
     if(path.endsWith('register')){
      if(!name)return json(res,400,{error:'Le nom est obligatoire.'});
      // Hash even for an existing address to avoid a fast duplicate-account response.
      const salt=randomBytes(16).toString('hex');const hash=(await scrypt(password,salt,64)).toString('hex');
      if(user)return json(res,409,{error:'Impossible de créer ce compte. Essayez de vous connecter.'});
      user={id:randomUUID(),email,name};
      try{await db.transaction(async()=>{await db.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5)',[user.id,email,name,`${salt}:${hash}`,now()]);await db.query('INSERT INTO libraries VALUES ($1,$2,0,$3)',[user.id,JSON.stringify({projects:[],active:null}),now()]);});}catch(e){if(e.code==='23505')return json(res,409,{error:'Impossible de créer ce compte.'});throw e;}
     }else{
      const [salt,expected]=(user?.password_hash||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');const actual=await scrypt(password,salt,64);
      if(!user||!timingSafeEqual(actual,Buffer.from(expected,'hex')))return json(res,401,{error:'Email ou mot de passe incorrect.'});
     }
     await openSession(res,user.id);return json(res,200,{user:{id:user.id,email:user.email,name:user.name,canChangePassword:!(await db.query('SELECT 1 FROM oauth_identities WHERE user_id=$1',[user.id])).rowCount}});
    }
    const user=await session(req);if(!user)return json(res,401,{error:'Connectez-vous pour accéder à votre atelier.'});
    if(await mcp.handleAccount(req,res,path,user))return;
    if(path==='/api/account'&&req.method==='PUT'){
     const parsed=z.object({name:credentialsSchema.shape.name.unwrap()}).strict().safeParse(await body(req));
     if(!parsed.success)return json(res,400,{error:'Indiquez un nom de 1 à 100 caractères.'});
     await db.query('UPDATE users SET name=$1 WHERE id=$2',[parsed.data.name,user.id]);return json(res,200,{user:{...user,name:parsed.data.name}});
    }
    if(path==='/api/account/password'&&req.method==='PUT'){
     if(!user.canChangePassword)return json(res,403,{error:'Votre mot de passe est géré par votre fournisseur de connexion.'});
     const key='password:'+user.id;let bucket=attempts.get(key);if(!bucket||bucket.until<=now()){bucket={count:0,until:now()+15*60000};attempts.set(key,bucket);}if(++bucket.count>10)return json(res,429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});
     const parsed=z.object({currentPassword:z.string().min(1).max(256),newPassword:credentialsSchema.shape.password}).strict().safeParse(await body(req));
     if(!parsed.success)return json(res,400,{error:'Le nouveau mot de passe doit contenir entre 12 et 256 caractères.'});
     const result=await db.transaction(async()=>{
      const row=(await db.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
      const [salt,expected]=row.password_hash.split(':');const actual=await scrypt(parsed.data.currentPassword,salt,64);
      if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))return false;
      const nextSalt=randomBytes(16).toString('hex'),nextHash=(await scrypt(parsed.data.newPassword,nextSalt,64)).toString('hex');
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[nextSalt+':'+nextHash,user.id]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);return true;
     });
     if(!result)return json(res,400,{error:'Le mot de passe actuel est incorrect.'});
     await openSession(res,user.id);return json(res,200,{ok:true});
    }
    if(path==='/api/settings'&&req.method==='GET'){
     const row=(await db.query('SELECT body FROM user_settings WHERE user_id=$1',[user.id])).rows[0];return json(res,200,{settings:row?.body||defaultSettings});
    }
    if(path==='/api/settings'&&req.method==='PUT'){
     const parsed=settingsSchema.safeParse(await body(req));if(!parsed.success)return json(res,400,{error:'Paramètres invalides.'});
     await db.query('INSERT INTO user_settings VALUES ($1,$2) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body',[user.id,JSON.stringify(parsed.data)]);return json(res,200,{settings:parsed.data});
    }
    if(path==='/api/project-theme'&&req.method==='GET'){
     const library=(await db.query('SELECT body FROM libraries WHERE user_id=$1',[user.id])).rows[0].body;
     const project=library.projects.find(p=>p.id===url.searchParams.get('projectId'));
     if(!project)return json(res,404,{error:'Projet introuvable.'});
     return json(res,200,await projectTheme({db,userId:user.id,cover:project.coverImage,loadImage:themeImageLoader}));
    }
    if(path==='/api/auth/me'&&req.method==='GET')return json(res,200,{user});
    if(path==='/api/auth/logout'&&req.method==='POST'){
     const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('atlas_session='))?.slice(14);
     if(token)await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});
    }
    if(path==='/api/media'&&req.method==='POST'){
     const input=await body(req);
     if(typeof input?.data!=='string'||input.data.length>4*1024*1024||!input.data.length||! /^[A-Za-z0-9+/]+={0,2}$/.test(input.data))return json(res,400,{error:'Image invalide. Choisissez un fichier JPG, PNG ou WebP de 3 Mo maximum.'});
     const bytes=Buffer.from(input.data,'base64');
     if(bytes.length>3*1024*1024)return json(res,413,{error:'L’image dépasse la limite de 3 Mo.'});
     // Reply only after COMMIT; uploads and saves lock the same account row.
     const respond=await db.transaction(async()=>{
     await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
     const known=(await db.query('SELECT id,width,height FROM media WHERE user_id=$1 AND hash=$2',[user.id,createHash('sha256').update(bytes).digest('hex')])).rows[0];
     if(known){await db.query('UPDATE media SET created_at=$1 WHERE id=$2',[now(),known.id]);return ()=>json(res,200,known);}
     let normalized;
     try{
      const source=sharp(bytes,{limitInputPixels:25_000_000,animated:false});const metadata=await source.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format))return ()=>json(res,400,{error:'Formats acceptés : JPG, PNG et WebP.'});
      normalized=await source.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
     }catch{return ()=>json(res,400,{error:'Impossible de lire cette image. Vérifiez le fichier et sa taille (25 mégapixels maximum).'});}
     if(normalized.data.length>3*1024*1024)return ()=>json(res,413,{error:'Cette image est trop volumineuse. Choisissez une version plus petite.'});
     const hash=createHash('sha256').update(normalized.data).digest('hex');const existing=(await db.query('SELECT id,width,height FROM media WHERE user_id=$1 AND hash=$2',[user.id,hash])).rows[0];
     if(existing){await db.query('UPDATE media SET created_at=$1 WHERE id=$2',[now(),existing.id]);return ()=>json(res,200,existing);}
     // Keep recent unattached uploads for in-progress drafts, but reclaim old ones.
     const library=(await db.query('SELECT body FROM libraries WHERE user_id=$1',[user.id])).rows[0].body;const referenced=new Set(mediaIds(library));
     for(const old of (await db.query('SELECT id FROM media WHERE user_id=$1 AND created_at<$2',[user.id,now()-7*DAY])).rows)if(!referenced.has(old.id))await db.query('DELETE FROM media WHERE id=$1 AND user_id=$2',[old.id,user.id]);
     const used=(await db.query('SELECT COALESCE(SUM(octet_length(body)),0) AS bytes FROM media WHERE user_id=$1',[user.id])).rows[0].bytes;
     if(Number(used)+normalized.data.length>imageQuotaBytes)return ()=>json(res,413,{error:'Votre espace images de 50 Mo est plein. Exportez vos projets et réduisez la taille des images.'});
     const id=randomUUID();await db.query('INSERT INTO media VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,user.id,hash,normalized.data,normalized.info.width,normalized.info.height,now()]);
     return ()=>json(res,201,{id,width:normalized.info.width,height:normalized.info.height});
     });
     return respond();
    }
    const imageMatch=path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
    if(imageMatch&&req.method==='GET'){
     const image=(await db.query('SELECT body FROM media WHERE id=$1 AND user_id=$2',[imageMatch[1],user.id])).rows[0];
     if(!image)return json(res,404,{error:'Image introuvable.'});
     res.writeHead(200,{'Content-Type':'image/webp','Content-Length':image.body.length,'Cache-Control':'private, no-store','Content-Disposition':'inline','Cross-Origin-Resource-Policy':'same-origin'});return res.end(Buffer.from(image.body));
    }
    if(path==='/api/library'&&req.method==='GET'){const row=(await db.query('SELECT body,revision FROM libraries WHERE user_id=$1',[user.id])).rows[0];return json(res,200,{data:row.body,revision:row.revision});}
    if(path==='/api/library'&&req.method==='PUT'){
     const input=await body(req);const parsed=librarySchema.safeParse(input?.data);
     if(!parsed.success||!Number.isSafeInteger(input?.revision)||input.revision<0)return json(res,400,{error:'Bibliothèque invalide. Vérifiez les projets, fiches et relations.'});
     // Reply only after COMMIT; uploads and saves lock the same account row.
     const respond=await db.transaction(async()=>{
     await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
     if((await db.query('SELECT id FROM media WHERE user_id=$1 AND id=ANY($2::text[])',[user.id,mediaIds(parsed.data)])).rowCount!==new Set(mediaIds(parsed.data)).size)return ()=>json(res,400,{error:'Une image est indisponible pour ce compte. Importez une sauvegarde contenant ses images ou retirez-la de la fiche.'});
     const result=await db.query('UPDATE libraries SET body=$1, revision=revision+1, updated_at=$2 WHERE user_id=$3 AND revision=$4',[JSON.stringify(parsed.data),now(),user.id,input.revision]);
     if(!result.rowCount)return ()=>json(res,409,{error:'Votre bibliothèque a changé dans une autre fenêtre. Exportez votre travail puis rechargez la page.'});
     return ()=>json(res,200,{revision:input.revision+1});
     });
     return respond();
    }
    return json(res,404,{error:'Route inconnue.'});
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   let target=resolve(dist,'.'+decodeURIComponent(path));
   if(!target.startsWith(resolve(dist)+sep)&&target!==resolve(dist)){res.writeHead(404);return res.end();}
   if(!existsSync(target)||!statSync(target).isFile()){
    if(extname(path)){res.writeHead(404);return res.end();}target=resolve(dist,'index.html');
   }
   if(!existsSync(target)){res.writeHead(503);return res.end('Compilez le frontend avec npm run build.');}
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
   res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':extname(target)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:readFileSync(target));
  }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Erreur du serveur. Réessayez plus tard.'});else res.end();}
 });
 server.on('close',()=>{db.close().catch(()=>{});});
 return {server,db};
}
