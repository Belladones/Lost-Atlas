import React,{useEffect,useRef,useState} from 'react';
import {Settings,X} from 'lucide-react';
import {api} from './account';
import {defaultSettings} from '../shared/settings';
import './settings.css';
export function useAppearanceSettings(){
 const [settings,setSettings]=useState(defaultSettings),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const mounted=useRef(true);
 async function reload(){setBusy(true);setError('');try{const result=await api('/api/settings');if(mounted.current){setSettings(result.settings);setLoaded(true);}}catch(e){if(mounted.current)setError(e.message);}finally{if(mounted.current)setBusy(false);}}
 useEffect(()=>{mounted.current=true;reload();return()=>{mounted.current=false;};},[]);
 async function save(adaptiveTheme){const previous=settings;setSettings({adaptiveTheme});setBusy(true);setError('');try{const result=await api('/api/settings',{method:'PUT',body:JSON.stringify({adaptiveTheme})});if(mounted.current)setSettings(result.settings);}catch(e){if(mounted.current){setSettings(previous);setError('Le réglage n’a pas pu être enregistré. Réessayez.');}}finally{if(mounted.current)setBusy(false);}}
 return {...settings,loaded,busy,error,save,reload};
}
export function SettingsDialog({appearance,onClose}){
 return <div className="modal-backdrop" onClick={()=>{if(!appearance.busy)onClose();}}><section className="modal settings-dialog" role="dialog" aria-modal="true" aria-label="Paramètres" onClick={e=>e.stopPropagation()}><button className="close icon" aria-label="Fermer les paramètres" disabled={appearance.busy} onClick={onClose}><X/></button><div className="eyebrow"><Settings size={14}/> VOTRE ATELIER</div><h2>Paramètres</h2><h3>Apparence</h3><label className="theme-setting"><span><strong>Adapter le thème à la couverture</strong><small>Les couleurs du projet habillent l’ensemble de l’application.</small></span><input type="checkbox" role="switch" aria-label="Adapter le thème à la couverture" checked={appearance.loaded&&appearance.adaptiveTheme} disabled={!appearance.loaded||appearance.busy} onChange={e=>appearance.save(e.target.checked)}/></label><p className="settings-description">Désactivez cette option pour retrouver le thème Lost Atlas d’origine, y compris le fond. Sans couverture, le thème d’origine est toujours utilisé.</p><p className="subtle">Ce choix est personnel et conservé pour vos prochaines connexions.</p>{appearance.error&&<div className="settings-error" role="alert">{appearance.error}{!appearance.loaded&&<button className="secondary" onClick={appearance.reload} disabled={appearance.busy}>Réessayer</button>}</div>}<p className="settings-save" role="status">{appearance.busy?'Enregistrement…':appearance.loaded&&!appearance.error?'Préférence enregistrée pour votre compte.':''}</p><button className="primary wide" disabled={appearance.busy} onClick={onClose}>Terminer</button></section></div>;
}
