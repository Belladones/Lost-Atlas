import React,{useState} from 'react';
import {imageUrl} from './media';
import {framingStyle} from './image-framing';

// A failure belongs to one source; replacing the URL makes the new image load.
export function SafeImage({reference,src,as:Tag='img',fallback=null,framing,...props}){
 const source=src||(reference?imageUrl(reference):'');
 const [failed,setFailed]=useState(null);
 if(!source||failed===source)return fallback;
 if(Tag==='image'&&framing)return <g clipPath={props.clipPath}><foreignObject x={props.x} y={props.y} width={props.width} height={props.height}><div style={{width:'100%',height:'100%',overflow:'hidden'}}><img src={source} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(source)} style={{width:'100%',height:'100%',objectFit:'cover',...framingStyle(framing)}}/></div></foreignObject></g>;
 return <Tag {...props} style={{...props.style,...framingStyle(framing)}} {...(Tag==='image'?{href:source}:{src:source})} referrerPolicy="no-referrer" onLoad={()=>setFailed(null)} onError={()=>setFailed(source)}/>;
}
export function ImageFrame({reference,as:Tag='div',className='',loadedClass='',imageClassName='',alt='',fallback=null,children,hideWhenEmpty=false,onUnavailable,framing,...props}){
 const [failed,setFailed]=useState(null);
 const active=!!reference&&failed!==reference;
 if(hideWhenEmpty&&!active)return null;
 return <Tag {...props} className={className+(active&&loadedClass?' '+loadedClass:'')}>
  {active?<img style={framingStyle(framing)} className={imageClassName} src={imageUrl(reference)} alt={alt} referrerPolicy="no-referrer" onLoad={()=>setFailed(null)} onError={()=>{setFailed(reference);onUnavailable?.();}}/>:fallback}
  {children}
 </Tag>;
}
