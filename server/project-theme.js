import sharp from 'sharp';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import ipaddr from 'ipaddr.js';
import {isExternalImage} from '../shared/media.js';
import {DEFAULT_BACKGROUND,darkCoverColor} from '../shared/theme.js';

export function isPublicAddress(address){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
// Pin DNS for each HTTPS hop. Never send cookies, follow redirects to private
// networks, keep unbounded bodies, or persist externally hosted image bytes.
export async function loadExternalImage(value,{resolveHost=lookup,httpsRequest=request}={},hop=0){
 if(!isExternalImage(value)||hop>3)throw Error('Unsupported image URL');
 const url=new URL(value);if(url.port&&url.port!=='443')throw Error('Unsupported port');
 let dnsTimer;
 const addresses=await Promise.race([resolveHost(url.hostname.replace(/^\[|\]$/g,''),{all:true,verbatim:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('DNS timeout')),3000);})]).finally(()=>clearTimeout(dnsTimer));
 if(!addresses.length||!addresses.every(item=>isPublicAddress(item.address)))throw Error('Private address');
 const chosen=addresses[0];
 return new Promise((resolve,reject)=>{
  let timer;
  const req=httpsRequest(url,{method:'GET',headers:{Accept:'image/jpeg,image/png,image/webp,image/avif,image/gif','User-Agent':'Lost-Atlas-Cover-Theme/1.0'},lookup:(_host,options,callback)=>callback(null,options.all?[chosen]:chosen.address,chosen.family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();loadExternalImage(new URL(res.headers.location,url).href,{resolveHost,httpsRequest},hop+1).then(resolve,reject);return;}
   if(res.statusCode!==200){res.resume();reject(Error('Image unavailable'));return;}
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>5*1024*1024){res.destroy();reject(Error('Image too large'));}else chunks.push(chunk);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
  });
  timer=setTimeout(()=>req.destroy(Error('Image timeout')),6000);req.once('close',()=>clearTimeout(timer));req.setTimeout(5000,()=>req.destroy(Error('Image timeout')));req.on('error',reject);req.end();
 });
}
const cache=new Map();
let activeDownloads=0;
export async function projectTheme({db,userId,cover,loadImage=loadExternalImage}){
 if(!cover)return {color:DEFAULT_BACKGROUND};
 const key=userId+':'+cover,cached=cache.get(key);if(cached&&cached.until>Date.now())return {color:cached.color};
 let color=DEFAULT_BACKGROUND;
 try{
  let bytes;
  if(isExternalImage(cover)){if(activeDownloads>=4)return {color:DEFAULT_BACKGROUND};activeDownloads++;try{bytes=await loadImage(cover);}finally{activeDownloads--;}}
  else bytes=(await db.query('SELECT body FROM media WHERE id=$1 AND user_id=$2',[cover,userId])).rows[0]?.body;
  if(bytes){const image=sharp(bytes,{limitInputPixels:25_000_000,animated:false});const meta=await image.metadata();if(['jpeg','png','webp','gif','heif'].includes(meta.format)){const small=await image.rotate().resize({width:80,height:80,fit:'inside',withoutEnlargement:true}).flatten({background:DEFAULT_BACKGROUND}).png().toBuffer();const {dominant}=await sharp(small).stats();color=darkCoverColor(dominant);}}
 }catch{}
 if(cache.size>=1000)cache.delete(cache.keys().next().value);
 cache.set(key,{color,until:Date.now()+(color===DEFAULT_BACKGROUND?30000:300000)});return {color};
}
