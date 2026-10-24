import React,{useEffect,useState} from 'react';
import {api} from './account';
import './mcp.css';

const pendingKey='atlas-mcp-authorization';
export function pendingMcpRequest(){
 const query=new URLSearchParams(location.search).get('mcp_authorization');
 try{
  if(/^[A-Za-z0-9_-]{43}$/.test(query||'')){sessionStorage.setItem(pendingKey,query);return query;}
  const saved=sessionStorage.getItem(pendingKey);return /^[A-Za-z0-9_-]{43}$/.test(saved||'')?saved:null;
 }catch{return /^[A-Za-z0-9_-]{43}$/.test(query||'')?query:null;}
}
export function clearMcpRequest(){
 try{sessionStorage.removeItem(pendingKey);}catch{}
 const url=new URL(location.href);url.searchParams.delete('mcp_authorization');history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function SharingNotice(){
 return <div className="mcp-sharing"><p>Les fiches, relations et passages de chapitres consultés par ChatGPT seront transmis à OpenAI pour traiter vos demandes. Seuls les projets sélectionnés seront accessibles, en lecture seule. Les images et votre mot de passe ne sont pas transmis.</p><p>Vous pourrez modifier les projets autorisés ou révoquer cette connexion dans les paramètres de Lost Atlas. La révocation bloque les accès futurs ; elle ne retire pas les passages déjà transmis à OpenAI.</p></div>;
}
function ProjectSelection({projects,selected,onChange,disabled}){
 return <fieldset className="mcp-projects" disabled={disabled}><legend>Projets accessibles</legend>{projects.length?projects.map(project=><label key={project.id}><input type="checkbox" checked={selected.includes(project.id)} onChange={e=>onChange(e.target.checked?[...selected,project.id]:selected.filter(id=>id!==project.id))}/><span>{project.name}</span></label>):<p>Vous n’avez aucun projet enregistré. Créez un projet dans Lost Atlas, puis recommencez depuis ChatGPT.</p>}</fieldset>;
}
export function McpConsent({requestId,user,onClose}){
 const [request,setRequest]=useState(null),[selected,setSelected]=useState([]),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;api('/api/mcp/authorization/'+requestId).then(result=>{if(active)setRequest(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[requestId]);
 async function answer(deny){
  setBusy(true);setError('');
  try{
   const result=await api('/api/mcp/authorization/'+requestId,{method:'POST',body:JSON.stringify(deny?{deny:true}:{projectIds:selected,sharingAccepted:accepted})});
   clearMcpRequest();location.assign(result.redirect);
  }catch(e){setError(e.message);setBusy(false);}
 }
 return <div className="account-screen" role="main"><section className="account-card mcp-consent"><div className="account-brand">✧ LOST ATLAS</div><div className="eyebrow">CONNEXION EN LECTURE SEULE</div><h1>Autoriser ChatGPT</h1><p>Connecté en tant que <strong>{user.name}</strong> ({user.email}).</p><SharingNotice/>{!request&&!error&&<p role="status">Chargement de la demande…</p>}{request&&<><p className="mcp-callback">Retour vers : {new URL(request.redirectUri).origin}</p><ProjectSelection projects={request.projects} selected={selected} onChange={ids=>{setSelected(ids);setAccepted(false);}} disabled={busy}/><label className="mcp-accept"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/><span>J’autorise le partage des contenus consultés de ces projets avec OpenAI via ChatGPT.</span></label><p className="subtle">Autorisation valable 30 jours. Les projets créés ensuite ne seront pas ajoutés automatiquement. ChatGPT ne pourra ni modifier ni supprimer vos textes.</p><div className="mcp-actions"><button className="primary" disabled={busy||!accepted||!selected.length} onClick={()=>answer(false)}>{busy?'Patientez…':'Autoriser la lecture'}</button><button className="secondary" disabled={busy} onClick={()=>answer(true)}>Refuser</button></div></>}{error&&<p className="settings-error" role="alert">{error}</p>}<button className="retry-connection" disabled={busy} onClick={()=>{clearMcpRequest();onClose();}}>Revenir à mon atelier sans autoriser</button></section></div>;
}
function Connection({connection,projects,enabled,onUpdate,onRevoke,busy}){
 const [selected,setSelected]=useState(()=>connection.projectIds.filter(id=>projects.some(p=>p.id===id))),[accepted,setAccepted]=useState(false);
 return <section className="mcp-connection"><h4>ChatGPT · lecture seule</h4><p className="subtle">Connecté le {new Date(connection.createdAt).toLocaleDateString('fr-FR')} · expire le {new Date(connection.expiresAt).toLocaleDateString('fr-FR')}</p><ProjectSelection projects={projects} selected={selected} onChange={ids=>{setSelected(ids);setAccepted(false);}} disabled={busy||!enabled}/><label className="mcp-accept"><input type="checkbox" checked={accepted} disabled={busy||!enabled} onChange={e=>setAccepted(e.target.checked)}/><span>J’autorise le partage avec OpenAI pour cette sélection.</span></label><div className="mcp-actions"><button className="secondary" disabled={busy||!enabled||!accepted||!selected.length} onClick={async()=>{if(await onUpdate(connection.id,selected))setAccepted(false);}}>Enregistrer les projets</button><button className="delete-action" disabled={busy} onClick={()=>onRevoke(connection.id)}>Révoquer la connexion</button></div></section>;
}
export function McpConnections(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(){const result=await api('/api/mcp/connections');setData(result);}
 useEffect(()=>{let active=true;api('/api/mcp/connections').then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function change(id,projectIds){
  setBusy(true);setError('');setMessage('');
  try{await api('/api/mcp/connections/'+id,{method:projectIds?'PUT':'DELETE',...(projectIds?{body:JSON.stringify({projectIds,sharingAccepted:true})}:{})});await load();setMessage(projectIds?'Projets autorisés mis à jour.':'Connexion révoquée. Les accès futurs sont bloqués.');return true;}
  catch(e){setError(e.message);return false;}finally{setBusy(false);}
 }
 return <section className="mcp-settings"><h3>Connexion depuis ChatGPT</h3><SharingNotice/>{data?.enabled?<><p className="settings-description">Dans une offre ChatGPT compatible avec les connecteurs MCP personnalisés, ajoutez ce serveur avec l’authentification OAuth, puis connectez votre compte Lost Atlas.</p><label>Adresse du connecteur<input readOnly value={data.endpoint} onFocus={e=>e.target.select()}/></label><p className="subtle">Exemple : « Consulte les fiches de Cassie et Léo et aide-moi à écrire leur prochaine rencontre. » Les propositions restent dans ChatGPT ; rien n’est enregistré dans Lost Atlas.</p></>:data?<p className="settings-description">Le connecteur n’est pas encore activé par l’hébergeur. Sa configuration nécessite l’adresse publique HTTPS et les URI de retour OAuth fournies par ChatGPT.</p>:<p role="status">Chargement des connexions…</p>}{data&&!data.connections.length&&<p className="subtle">Aucune connexion autorisée.</p>}{data?.connections.map(connection=><Connection key={connection.id+':'+connection.projectIds.join(',')} connection={connection} projects={data.projects} enabled={data.enabled} busy={busy} onUpdate={change} onRevoke={id=>change(id)}/>)}{error&&<div className="settings-error" role="alert">{error}{!data&&<button className="secondary" onClick={()=>{setError('');load().catch(e=>setError(e.message));}}>Réessayer</button>}</div>}<p className="settings-save" role="status">{busy?'Mise à jour…':message}</p></section>;
}
