import React,{useEffect,useRef,useState} from 'react';
import './background.css';
export async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
 const result=await response.json().catch(()=>({error:'Réponse serveur invalide.'}));
 if(!response.ok){const error=new Error(result.error||'Connexion au serveur impossible.');error.status=response.status;throw error;}return result;
}
export function AccountGate({children}){
 const [providers,setProviders]=useState({google:false,apple:false});
 const [account,setAccount]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(()=>{const code=new URLSearchParams(location.search).get('authError');return code==='account_exists'?'Un compte utilise déjà cette adresse. Connectez-vous avec votre méthode habituelle.':code==='cancelled'?'Connexion annulée. Vous pouvez réessayer.':code?'La connexion n’a pas abouti. Réessayez.':'';}),[register,setRegister]=useState(false),[busy,setBusy]=useState(false);
 async function restore(){setLoading(true);try{const {user}=await api('/api/auth/me');const library=await api('/api/library');setAccount({user,...library});}catch(e){if(e.status!==401)setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{restore();api('/api/auth/providers').then(setProviders).catch(()=>{});if(new URLSearchParams(location.search).has('authError'))history.replaceState(null,'',location.pathname+location.hash);},[]);
 async function authenticate(e){e.preventDefault();setBusy(true);setError('');const values=Object.fromEntries(new FormData(e.currentTarget));try{const {user}=await api('/api/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify(values)});const library=await api('/api/library');setAccount({user,...library});}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function logout(){await api('/api/auth/logout',{method:'POST',body:'{}'});setAccount(null);setRegister(false);setError('');}
 if(loading)return <div className="account-screen"><p role="status">Ouverture de votre atelier…</p></div>;
 if(account)return children({...account,onLogout:logout});
 return <div className="account-screen"><section className="account-card"><div className="account-brand">✧ LOST ATLAS</div><div className="eyebrow">CHAQUE HISTOIRE EST UN MONDE</div><h1>{register?'Votre atelier vous attend':'Retrouvez votre univers'}</h1><p className="account-intro">Vos projets, vos personnages et vos manuscrits réunis dans un espace personnel.</p><div className="account-tabs"><button className={!register?'chosen':''} onClick={()=>{setRegister(false);setError('')}}>Se connecter</button><button className={register?'chosen':''} onClick={()=>{setRegister(true);setError('')}}>Créer un compte</button></div><div className="social-auth">{[['google','Google'],['apple','Apple']].map(([id,label])=><button key={id} type="button" disabled={!providers[id]||busy} title={providers[id]?'Continuer avec '+label:'Cette connexion n’est pas encore disponible.'} onClick={()=>{location.assign('/api/auth/oauth/'+id);}}>{id==='google'?<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2Z"/><path fill="#ea4335" d="M12 6c1.5 0 2.8.5 3.8 1.5L18.6 4A9.5 9.5 0 0 0 12 2a10 10 0 0 0-9 5.4L6.4 10c.8-2.3 3-4 5.6-4Z"/></svg>:<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 12.5c0-2 1.6-3 1.7-3.1-1-1.5-2.5-1.7-3-1.7-1.3-.2-2.5.8-3.1.8-.7 0-1.7-.8-2.8-.8C7.5 7.8 6 9.5 6 12.1c0 1.6.6 3.3 1.3 4.5.7 1.1 1.5 2.3 2.6 2.3 1 0 1.4-.7 2.8-.7s1.7.7 2.8.7 1.9-1 2.6-2.1c.7-1.2 1-2.3 1-2.4-.1 0-2.1-.8-2.1-2.9ZM14.7 6.3c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.8-1.3Z"/></svg>}Continuer avec {label}</button>)}</div><div className="auth-separator"><span>ou par email</span></div><form onSubmit={authenticate}>{register&&<label>Nom d’auteur<input name="name" autoComplete="name" required maxLength={100}/></label>}<label>Adresse email<input type="email" name="email" autoComplete="email" required maxLength={254}/></label><label>Mot de passe<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={256}/></label><small>12 caractères minimum.</small>{error&&<p className="account-error" role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy?'Patientez…':register?'Créer mon atelier':'Ouvrir mon atelier'}</button></form><p className="account-footnote">Chaque compte possède sa bibliothèque privée. Vos textes ne sont pas utilisés par une IA.</p><button className="retry-connection" onClick={restore}>Réessayer la connexion au serveur</button></section></div>;
}
export function useServerLibrary(initialData,initialRevision){
 const [data,setData]=useState(initialData),[status,setStatus]=useState('saved'),[message,setMessage]=useState('');
 const current=useRef(initialData),saved=useRef(initialData),revision=useRef(initialRevision),timer=useRef(),flight=useRef(null),blocked=useRef(false),mounted=useRef(true);
 async function flush(){
  clearTimeout(timer.current);
  if(flight.current){await flight.current;if(current.current===saved.current)return;}
  if(blocked.current){setStatus('error');throw Error('Conflit : exportez votre travail puis rechargez la page.');}
  if(current.current===saved.current)return;
  const operation=(async()=>{
   try{while(current.current!==saved.current){const snapshot=current.current;setStatus('saving');const result=await api('/api/library',{method:'PUT',body:JSON.stringify({data:snapshot,revision:revision.current})});revision.current=result.revision;saved.current=snapshot;}if(mounted.current){setStatus('saved');setMessage('');}}
   catch(e){if(e.status===409)blocked.current=true;if(mounted.current){setStatus('error');setMessage(e.message);}throw e;}
  })();
  flight.current=operation;
  try{await operation;}finally{flight.current=null;}
 }
 function commit(next){current.current=next;setData(next);setStatus(blocked.current?'error':'pending');clearTimeout(timer.current);if(blocked.current)return;timer.current=setTimeout(()=>{flush().catch(()=>{});},400);}
 useEffect(()=>{mounted.current=true;const warn=e=>{if(current.current!==saved.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>{mounted.current=false;clearTimeout(timer.current);window.removeEventListener('beforeunload',warn);};},[]);
 return {data,commit,status,message,flush};
}
