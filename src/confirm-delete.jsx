import React,{useEffect,useRef} from 'react';
import {Download,Trash2,X} from 'lucide-react';
export function ConfirmDelete({target,onCancel,onConfirm,onExport}){
 const dialog=useRef(null),cancel=useRef(null),cancelAction=useRef(onCancel);
 cancelAction.current=onCancel;
 useEffect(()=>{
  const previous=document.activeElement;cancel.current?.focus();
  function keydown(e){
   if(e.key==='Escape'){e.preventDefault();cancelAction.current();}
   if(e.key==='Tab'){
    const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  }
  document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
 },[]);
 return <div className="modal-backdrop confirm-backdrop" onClick={onCancel}><section ref={dialog} className="modal confirm-delete" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-detail" onClick={e=>e.stopPropagation()}><button className="close icon" aria-label="Annuler la suppression" onClick={onCancel}><X size={20}/></button><span className="delete-emblem"><Trash2 size={23}/></span><div className="eyebrow">UNE DERNIÈRE VÉRIFICATION</div><h2 id="delete-title">Supprimer « {target.label||'Sans titre'} » ?</h2><p id="delete-detail">{target.detail} Cette suppression est définitive après enregistrement.</p><button className="export-before-delete" onClick={onExport}><Download size={15}/>Exporter le projet avant suppression</button><div className="confirm-actions"><button ref={cancel} className="secondary" onClick={onCancel}>Annuler</button><button className="danger-button" onClick={onConfirm}><Trash2 size={15}/>Supprimer définitivement</button></div></section></div>;
}
