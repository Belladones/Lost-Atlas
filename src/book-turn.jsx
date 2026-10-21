import React,{useLayoutEffect,useRef,useMemo} from 'react';
import {curlFrame} from './book-turn';
export function BookTurn({width,spread,previous,gesture,renderFront,renderBack,onComplete}){
 const playback=useRef([]),surface=useRef(null),done=useRef(onComplete);done.current=onComplete;const count=12;
 const faces=useMemo(()=>({front:renderFront(),back:renderBack()}),[width,spread,previous]);
 const direction=spread===2&&previous?-1:1,incoming=spread===1&&previous;
 useLayoutEffect(()=>{
  let active=true;const strips=[...surface.current.querySelectorAll('.book-curl-strip')];
  const animations=strips.map((node,index)=>node.animate(Array.from({length:41},(_,frame)=>{const t=frame/40,p=incoming?1-t:t;return{offset:t,transform:curlFrame(p,width,index,count,direction)};}),{duration:880,easing:gesture?'linear':'cubic-bezier(.35,.05,.2,1)',fill:'both'}));
  const shading=[...surface.current.querySelectorAll('.book-curl-shade')].map((node,index)=>node.animate([{opacity:0},{opacity:.14+.18*Math.sin(Math.floor(index/2)/(count-1)*Math.PI),offset:.5},{opacity:0}],{duration:880,easing:'ease-in-out',fill:'both'}));
  playback.current=[...animations,...shading];if(gesture)playback.current.forEach(a=>{a.pause();a.currentTime=gesture.progress*880;});
  Promise.all(animations.map(a=>a.finished)).then(()=>{if(active)done.current();}).catch(()=>{});
  return()=>{active=false;[...animations,...shading].forEach(a=>a.cancel());};
 },[width,direction,incoming]);
 useLayoutEffect(()=>{
  if(!gesture)return;
  playback.current.forEach(a=>{a.pause();a.currentTime=gesture.progress*880;if(gesture.released){a.playbackRate=gesture.commit?1.5:-1.5;a.play();}});
 },[gesture]);
 return <div className="book-turn-viewport" aria-hidden="true" inert><div ref={surface} className={'book-curl '+(spread===2?'book-curl-spread ':'')+(previous?'book-curl-previous':'')} style={{'--leaf-width':width+'px','--strip-width':width/count+'px'}}>{Array.from({length:count},(_,i)=>{const frontIndex=direction===1?i:count-1-i,backIndex=count-1-frontIndex;return <div className="book-curl-strip" key={i} style={{transform:curlFrame(incoming?1:0,width,i,count,direction)}}><div className="book-curl-face book-curl-front"><div className="book-curl-content" style={{left:-frontIndex*width/count}}>{faces.front}</div><div className="book-curl-shade"/></div><div className="book-curl-face book-curl-back"><div className="book-curl-content" style={{left:-backIndex*width/count}}>{faces.back}</div><div className="book-curl-shade"/></div></div>;})}</div></div>;
}
