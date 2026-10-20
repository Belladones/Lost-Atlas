import React,{useEffect,useRef,useState} from 'react';
export async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
 const result=await response.json().catch(()=>({error:'Réponse serveur invalide.'}));
 if(!response.ok){const error=new Error(result.error||'Connexion au serveur impossible.');error.status=response.status;throw error;}return result;
}
export function AccountGate({children}){
 const [account,setAccount]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[register,setRegister]=useState(false),[busy,setBusy]=useState(false);
 async function restore(){setLoading(true);setError('');try{const {user}=await api('/api/auth/me');const library=await api('/api/library');setAccount({user,...library});}catch(e){if(e.status!==401)setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{restore();},[]);
 async function authenticate(e){e.preventDefault();setBusy(true);setError('');const values=Object.fromEntries(new FormData(e.currentTarget));try{const {user}=await api('/api/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify(values)});const library=await api('/api/library');setAccount({user,...library});}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function logout(){await api('/api/auth/logout',{method:'POST',body:'{}'});setAccount(null);setRegister(false);setError('');}
 if(loading)return <div className="account-screen"><p role="status">Ouverture de votre atelier…</p></div>;
 if(account)return children({...account,onLogout:logout});
 return <div className="account-screen"><section className="account-card"><div className="account-brand">✧ LOST ATLAS</div><div className="eyebrow">CHAQUE HISTOIRE EST UN MONDE</div><h1>{register?'Votre atelier vous attend':'Retrouvez votre univers'}</h1><p className="account-intro">Vos projets, vos personnages et vos manuscrits réunis dans un espace personnel.</p><div className="account-tabs"><button className={!register?'chosen':''} onClick={()=>{setRegister(false);setError('')}}>Se connecter</button><button className={register?'chosen':''} onClick={()=>{setRegister(true);setError('')}}>Créer un compte</button></div><form onSubmit={authenticate}>{register&&<label>Nom d’auteur<input name="name" autoComplete="name" required maxLength={100}/></label>}<label>Adresse email<input type="email" name="email" autoComplete="email" required maxLength={254}/></label><label>Mot de passe<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={256}/></label><small>12 caractères minimum.</small>{error&&<p className="account-error" role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy?'Patientez…':register?'Créer mon atelier':'Ouvrir mon atelier'}</button></form><p className="account-footnote">Chaque compte possède sa bibliothèque privée. Vos textes ne sont pas utilisés par une IA.</p><button className="retry-connection" onClick={restore}>Réessayer la connexion au serveur</button></section></div>;
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
