import React,{useState} from 'react';
import {imageUrl} from './media';

// A failure belongs to one source; replacing the URL makes the new image load.
export function SafeImage({reference,src,as:Tag='img',fallback=null,...props}){
 const source=src||(reference?imageUrl(reference):'');
 const [failed,setFailed]=useState(null);
 if(!source||failed===source)return fallback;
 return <Tag {...props} {...(Tag==='image'?{href:source}:{src:source})} referrerPolicy="no-referrer" onLoad={()=>setFailed(null)} onError={()=>setFailed(source)}/>;
}
export function ImageFrame({reference,as:Tag='div',className='',loadedClass='',imageClassName='',alt='',fallback=null,children,hideWhenEmpty=false,onUnavailable,...props}){
 const [failed,setFailed]=useState(null);
 const active=!!reference&&failed!==reference;
 if(hideWhenEmpty&&!active)return null;
 return <Tag {...props} className={className+(active&&loadedClass?' '+loadedClass:'')}>
  {active?<img className={imageClassName} src={imageUrl(reference)} alt={alt} referrerPolicy="no-referrer" onLoad={()=>setFailed(null)} onError={()=>{setFailed(reference);onUnavailable?.();}}/>:fallback}
  {children}
 </Tag>;
}
