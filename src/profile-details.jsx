import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,BookOpen,Image,Network,X} from 'lucide-react';
import {characterSections} from '../shared/character';
import {imageUrl} from './media';
import {mentionParts} from './model';
function ImageZoom({image,onClose}){
 const ref=useRef();useEffect(()=>{ref.current.showModal();},[]);
 return <dialog className="image-lightbox" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><button className="icon" aria-label="Fermer l’image" onClick={onClose}><X/></button><figure><img src={imageUrl(image.id)} alt={image.caption||'Illustration de la fiche'}/>{image.caption&&<figcaption>{image.caption}</figcaption>}</figure></dialog>;
}
export function ProfileDetails({entity,project,onOpen,onChapter}){
 const [tab,setTab]=useState('identity'),[zoom,setZoom]=useState(null);
 const character=entity.type==='Personnage';const fields=characterSections.find(s=>s.id===tab)?.fields||[];
 const appearances=project.chapters.filter(c=>mentionParts(c.text,[entity]).some(p=>p.id===entity.id));
 const relations=project.relations.filter(r=>r.from===entity.id||r.to===entity.id);
 const tabs=[['identity',character?'Identité':'Détails'],...(character?[['psychology','Psychologie'],['story','Histoire'],['appearance','Apparence']]:[]),['gallery',`Galerie${entity.gallery?.length?' · '+entity.gallery.length:''}`],['links','Liens & mentions']];
 return <><div className="profile-tabs" role="tablist" aria-label="Consulter la fiche">{tabs.map(([id,label])=><button key={id} role="tab" id={'profile-tab-'+id} aria-selected={tab===id} aria-controls={'profile-panel-'+id} onClick={()=>setTab(id)}>{label}</button>)}</div><section className="profile-panel" role="tabpanel" id={'profile-panel-'+tab} aria-labelledby={'profile-tab-'+tab}>
 {character&&fields.length>0&&<>{fields.some(([key])=>entity.character?.[key])?<dl className={tab==='identity'?'identity-details':'character-details'}>{fields.filter(([key])=>entity.character?.[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{entity.character[key]}</dd></div>)}</dl>:<p className="profile-empty">Cette partie de son histoire reste à écrire. Complétez-la avec « Modifier la fiche ».</p>}</>}
 {tab==='identity'&&<><h4>Noms & alias</h4><div className="tags">{[entity.name,...entity.alias.split(',')].filter(x=>x.trim()).map((a,i)=><span key={i}>{a.trim()}</span>)}</div>{entity.customFields?.length>0&&<><h4>Détails singuliers</h4><dl className="character-details custom-details">{entity.customFields.map(f=><div key={f.id}><dt>{f.label}</dt><dd>{f.value||'Non renseigné'}</dd></div>)}</dl></>}</>}
 {tab==='gallery'&&<>{entity.gallery?.length?<div className="profile-gallery">{entity.gallery.map((image,i)=><button key={image.id+'-'+i} aria-label={image.caption||'Agrandir l’image '+(i+1)} onClick={()=>setZoom(image)}><img src={imageUrl(image.id)} alt={image.caption||`Inspiration ${i+1}`} loading="lazy"/>{image.caption&&<span>{image.caption}</span>}</button>)}</div>:<div className="profile-empty"><Image size={25}/><p>Portraits, tenues, atmosphères… Ajoutez vos inspirations dans l’onglet Images de l’éditeur.</p></div>}</>}
 {tab==='links'&&<><h4>Relations · {relations.length}</h4>{relations.map((r,i)=>{const other=project.entities.find(e=>e.id===(r.from===entity.id?r.to:r.from));return other&&<button className="profile-relation" key={i} onClick={()=>onOpen(other.id)}><Network size={16}/><span><strong>{other.name}</strong><small>{r.label}</small></span><ArrowUpRight size={15}/></button>})}{!relations.length&&<p className="profile-empty">Aucune relation pour le moment.</p>}<h4>Apparitions · {appearances.length}</h4>{appearances.map(c=><button className="appearance" key={c.id} onClick={()=>onChapter(c)}><BookOpen size={16}/>{c.title}<ArrowUpRight size={14}/></button>)}{!appearances.length&&<p className="profile-empty">Aucune mention dans le manuscrit pour le moment.</p>}</>}
 </section>{zoom&&<ImageZoom image={zoom} onClose={()=>setZoom(null)}/>}</>;
}
