import React,{useLayoutEffect,useMemo,useRef,useState,useEffect} from 'react';
import {ArrowLeft,ArrowRight,Feather,BookOpen} from 'lucide-react';
import {paginateBook} from './manuscript';
import './book-reader.css';
import {BookTurn} from './book-turn.jsx';
export function BookReader({project,onEntity,onEdit}){
 const measure=useRef(null),reader=useRef(null),[pages,setPages]=useState([]),[position,setPosition]=useState(0),[spread,setSpread]=useState(1),[fontSize,setFontSize]=useState(17),[flip,setFlip]=useState(null);
 const turning=useRef(false),surface=useRef(null),drag=useRef(null);
 const anchor=useRef({chapterId:project.chapters[0]?.id,chapterPage:0});
 useLayoutEffect(()=>{
  const node=measure.current;let active=true,frame;
  const layout=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!active)return;turning.current=false;drag.current=null;setFlip(null);node.style.height='';const baseHeight=node.clientHeight;const count=window.matchMedia('(min-width:1050px)').matches?2:1;const next=paginateBook(project.chapters,project.entities,(text,chapterPage)=>{node.style.height=(baseHeight+(chapterPage?101:0))+'px';node.textContent=text;return node.scrollHeight<=node.clientHeight;});node.textContent='';node.style.height='';setSpread(count);setPages(next);let index=next.findIndex(p=>p.chapterId===anchor.current.chapterId&&p.chapterPage===anchor.current.chapterPage);if(index<0)index=next.findIndex(p=>p.chapterId===anchor.current.chapterId);setPosition(Math.max(0,index));});};
  const observer=new ResizeObserver(layout);observer.observe(node);layout();document.fonts?.ready.then(()=>{if(active)layout();});return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();};
 },[project.chapters,project.entities,fontSize]);
 const last=Math.max(0,pages.length-1),current=pages[position];
 function turn(next,animate=true){
  if(turning.current)return;
  const value=Math.max(0,Math.min(last,next));if(value===position)return;
  const width=surface.current?.querySelector('.book-sheet')?.getBoundingClientRect().width;
  if(animate&&width&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){turning.current=true;setFlip({from:position,to:value,previous:value<position,width});}
  setPosition(value);if(pages[value])anchor.current={chapterId:pages[value].chapterId,chapterPage:pages[value].chapterPage};
 }
 function startDrag(e){
  if(turning.current||!pages.length||e.button!==0||e.target.closest('a,button,input,select,textarea'))return;
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,previous:spread===2?e.clientX<surface.current.getBoundingClientRect().left+surface.current.clientWidth/2:null,active:false,progress:0};
 }
 function moveDrag(e){
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.active){
   if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){drag.current=null;return;}
   if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.2)return;
   const previous=d.previous??dx>0;if((previous&&dx<0)||(!previous&&dx>0))return;
   const to=Math.max(0,Math.min(last,position+(previous?-spread:spread)));if(to===position){drag.current=null;return;}
   d.active=true;d.previous=previous;d.to=to;d.width=surface.current.querySelector('.book-sheet').getBoundingClientRect().width;turning.current=true;surface.current.setPointerCapture(e.pointerId);
   setFlip({from:position,to,previous,width:d.width,gesture:{progress:0,released:false,commit:false}});
  }
  e.preventDefault();d.progress=Math.max(0,Math.min(.99,(d.previous?dx:-dx)/d.width));
  setFlip(old=>old?{...old,gesture:{progress:d.progress,released:false,commit:false}}:old);
 }
 function endDrag(e,cancelled=false){
  const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;
  if(!d.active)return;
  const commit=!cancelled&&d.progress>=.28;
  if(surface.current.hasPointerCapture(e.pointerId))surface.current.releasePointerCapture(e.pointerId);
  if(commit){setPosition(d.to);if(pages[d.to])anchor.current={chapterId:pages[d.to].chapterId,chapterPage:pages[d.to].chapterPage};}
  if(d.progress<.001||window.matchMedia('(prefers-reduced-motion: reduce)').matches){finishTurn();return;}
  setFlip(old=>old?{...old,gesture:{progress:d.progress,released:true,commit}}:old);
 }
 function finishTurn(){turning.current=false;setFlip(null);}
 function sheet(index,animated=false){const p=pages[index];return <article className={'book-sheet '+(!p?'book-blank':'')+(p?.chapterPage?' book-continuation':'')+(animated?' book-sheet-copy':'')} aria-label={p?`Page ${index+1}, ${p.title}`:'Fin du livre'} inert={!!flip&&!animated}><div className="book-running-title">{p?`CHAPITRE ${String(p.chapterIndex+1).padStart(2,'0')}${p.chapterPage?' · SUITE':''}`:'✧'}</div>{(!p||p.chapterPage===0)&&<h2>{p?.title||'Fin'}</h2>}<div className="book-page-text">{p?p.parts.length?p.parts.map((part,i)=>part.id?<a className="book-mention" key={i} href={'#fiche-'+part.id} onClick={e=>{e.preventDefault();onEntity(part.id);}} title="Ouvrir la fiche">{part.text}</a>:<React.Fragment key={i}>{part.text}</React.Fragment>):<span className="book-unwritten">Ce chapitre reste à écrire.</span>:<span className="book-end-mark">✧</span>}</div><div className="book-folio">{p?index+1:'FIN'}</div></article>;}
 const base=flip?spread===2?(flip.previous?[flip.to,flip.from+1]:[flip.from,flip.to+1]):[flip.previous?flip.from:flip.to]:Array.from({length:spread},(_,slot)=>position+slot);

 const toc=useMemo(()=>project.chapters.map((c,i)=>({id:c.id,title:c.title,index:i,page:pages.findIndex(p=>p.chapterId===c.id)})),[project.chapters,pages]);
 useEffect(()=>{const node=reader.current;const onKey=e=>{if(e.target.closest('button,input,select,textarea,a')||document.querySelector('.drawer-backdrop,.modal-backdrop'))return;if(e.key==='ArrowRight'){e.preventDefault();turn(position+spread);}if(e.key==='ArrowLeft'){e.preventDefault();turn(position-spread);}};node?.addEventListener('keydown',onKey);return()=>node?.removeEventListener('keydown',onKey);},[position,spread,last,pages]);
 return <section className="book-reader" ref={reader} tabIndex={0} aria-label="Visualisation du livre" style={{'--book-font-size':fontSize+'px'}}><div className="book-heading"><div><div className="eyebrow">VISUALISATION DU LIVRE</div><h1>{project.name}</h1><p>Vos chapitres à la suite, dans l’ordre du manuscrit. Les noms soulignés ouvrent les fiches de votre univers.</p></div><button className="secondary" disabled={!current||!!flip} onClick={()=>onEdit(project.chapters.find(c=>c.id===current.chapterId))}><Feather size={15}/> Revenir à l’écriture</button></div><div className="book-controls"><label>Sommaire<select aria-label="Aller au chapitre" value={current?.chapterId||''} disabled={!pages.length||!!flip} onChange={e=>turn(toc.find(c=>c.id===e.target.value).page,false)}>{!toc.length&&<option value="">Aucun chapitre</option>}{toc.map(c=><option key={c.id} value={c.id}>{String(c.index+1).padStart(2,'0')} — {c.title||'Sans titre'}</option>)}</select></label><label>Taille du texte<select aria-label="Taille du texte du livre" value={fontSize} disabled={!!flip} onChange={e=>setFontSize(Number(e.target.value))}><option value={15}>Petite</option><option value={17}>Moyenne</option><option value={20}>Grande</option></select></label><span className="book-page-count" role="status">{pages.length?`Page ${position+1}${spread===2&&position+1<pages.length?'–'+(position+2):''} sur ${pages.length}`:'Aucune page'}</span></div><div className="book-spread" ref={surface} data-turning={!!flip} aria-busy={!!flip} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={e=>endDrag(e,true)} onLostPointerCapture={e=>endDrag(e,true)} onDragStart={e=>e.preventDefault()}><div className="book-measure book-page-text" ref={measure} aria-hidden="true"/>{!pages.length?<div className="book-empty"><BookOpen size={34}/><h2>Votre livre attend ses premiers mots.</h2><p>Créez un chapitre dans le manuscrit pour commencer.</p></div>:base.map(index=><React.Fragment key={index}>{sheet(index)}</React.Fragment>)}{flip&&<BookTurn width={flip.width} spread={spread} previous={flip.previous} gesture={flip.gesture} onComplete={finishTurn} renderFront={()=>sheet(spread===1?(flip.previous?flip.to:flip.from):(flip.previous?flip.from:flip.from+1),true)} renderBack={()=>sheet(spread===1?(flip.previous?flip.from:flip.to):(flip.previous?flip.to+1:flip.to),true)}/>}</div><div className="book-navigation"><button className="secondary" aria-label="Page précédente" disabled={!!flip||!pages.length||position===0} onClick={()=>turn(position-spread)}><ArrowLeft size={17}/> Précédente</button><span>{position+spread>=pages.length&&pages.length?'Fin du livre':'Glissez les pages ou utilisez les flèches'}</span><button className="secondary" aria-label="Page suivante" disabled={!!flip||!pages.length||position+spread>=pages.length} onClick={()=>turn(position+spread)}>Suivante <ArrowRight size={17}/></button></div></section>;
}
