import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
const hash=token=>createHash('sha256').update(token).digest('hex');
const selection=z.object({enabled:z.boolean(),projectIds:z.array(z.string().min(1).max(100)).max(100)}).strict();
export function createReadApi({db,now,json,body}){
 const projects=async userId=>(await db.query('SELECT body FROM libraries WHERE user_id=$1',[userId])).rows[0]?.body.projects||[];
 async function handleAccount(req,res,path,user){
  if(!path.startsWith('/api/account/api-access'))return false;
  if(path==='/api/account/api-access'&&req.method==='GET'){
   const row=(await db.query('SELECT enabled,project_ids,created_at,token_hash IS NOT NULL AS has_token FROM api_access WHERE user_id=$1',[user.id])).rows[0];
   const available=await projects(user.id);
   json(res,200,{enabled:row?.enabled||false,projectIds:(row?.project_ids||[]).filter(id=>available.some(p=>p.id===id)),hasToken:row?.has_token||false,createdAt:row?.created_at?Number(row.created_at):null,projects:available.map(p=>({id:p.id,name:p.name}))});return true;
  }
  if(path==='/api/account/api-access'&&req.method==='PUT'){
   const parsed=selection.safeParse(await body(req));
   if(!parsed.success){json(res,400,{error:'Paramètres API invalides.'});return true;}
   const {enabled,projectIds}=parsed.data;
   const result=await db.transaction(async()=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
    const available=await projects(user.id);
    if(new Set(projectIds).size!==projectIds.length||projectIds.some(id=>!available.some(p=>p.id===id))||(enabled&&!projectIds.length))return false;
    await db.query('INSERT INTO api_access(user_id,enabled,project_ids) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,project_ids=$3,token_hash=CASE WHEN $2 THEN api_access.token_hash ELSE NULL END,created_at=CASE WHEN $2 THEN api_access.created_at ELSE NULL END',[user.id,enabled,JSON.stringify(projectIds)]);return true;
   });
   json(res,result?200:400,result?{ok:true}:{error:'Sélectionnez uniquement vos projets, au moins un pour activer l’API.'});return true;
  }
  if(path==='/api/account/api-access/token'&&['POST','DELETE'].includes(req.method)){
   if(req.method==='DELETE'){await db.query('UPDATE api_access SET token_hash=NULL,created_at=NULL WHERE user_id=$1',[user.id]);json(res,200,{ok:true});return true;}
   const token='atlas_'+randomBytes(32).toString('hex');
   const result=await db.query('UPDATE api_access SET token_hash=$1,created_at=$2 WHERE user_id=$3 AND enabled=TRUE AND jsonb_array_length(project_ids)>0',[hash(token),now(),user.id]);
   json(res,result.rowCount?201:400,result.rowCount?{token}:{error:'Activez l’API et sélectionnez les projets avant de générer un token.'});return true;
  }
  json(res,404,{error:'Route inconnue.'});return true;
 }
 async function handlePublic(req,res,url){
  const path=url.pathname;
  if(path!=='/api/v1'&&!path.startsWith('/api/v1/'))return false;
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET'){res.setHeader('Allow','GET');json(res,405,{error:'API en lecture seule.'});return true;}
  const token=req.headers.authorization?.match(/^Bearer (atlas_[a-f0-9]{64})$/)?.[1];
  const row=token?(await db.query('SELECT user_id,project_ids FROM api_access WHERE token_hash=$1 AND enabled=TRUE',[hash(token)])).rows[0]:null;
  if(!row){res.setHeader('WWW-Authenticate','Bearer');json(res,401,{error:'Token absent, invalide ou révoqué.'});return true;}
  const available=(await projects(row.user_id)).filter(p=>row.project_ids.includes(p.id));
  let items;
  if(path==='/api/v1/projects')items=available.map(p=>({id:p.id,name:p.name,genre:p.genre,description:p.description}));
  else{
   const match=path.match(/^\/api\/v1\/projects\/([^/]+)\/(characters|organizations|creatures|places|relations|chapters)$/);
   if(!match){json(res,404,{error:'Route inconnue.'});return true;}
   let id;try{id=decodeURIComponent(match[1]);}catch{json(res,400,{error:'Identifiant invalide.'});return true;}
   const project=available.find(p=>p.id===id);
   if(!project){json(res,404,{error:'Projet introuvable ou non autorisé.'});return true;}
   const type={characters:'Personnage',organizations:'Organisation',creatures:'Créature',places:'Lieu'}[match[2]];
   if(type)items=project.entities.filter(e=>e.type===type).map(({id,name,alias,type,role,description,symbol,character,customFields})=>({id,name,alias,type,role,description,symbol,character,customFields}));
   else if(match[2]==='chapters')items=project.chapters.map(({id,title,text,status},index)=>({id,title,text,status,position:index+1}));
   else items=project.relations.map(r=>({...r,fromName:project.entities.find(e=>e.id===r.from)?.name,toName:project.entities.find(e=>e.id===r.to)?.name}));
  }
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??20);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100){json(res,400,{error:'Pagination invalide : offset ≥ 0, limit entre 1 et 100.'});return true;}
  json(res,200,{items:items.slice(offset,offset+limit),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null});return true;
 }
 return {handleAccount,handlePublic};
}
