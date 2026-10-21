import {imageUrl} from './media';
import {coverColorFromPixels} from '../shared/theme';
// Browser fallback for public hosts that allow CORS but refuse server requests.
// A canvas security error simply keeps the original background.
export function browserCoverColor(reference,signal){
 return new Promise(resolve=>{
  if(signal?.aborted){resolve(null);return;}
  const image=new Image();let finished=false;
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;signal?.removeEventListener('abort',abort);image.removeAttribute('src');resolve(value);};
  const abort=()=>finish(null),timer=setTimeout(abort,5000);
  signal?.addEventListener('abort',abort,{once:true});
  image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
  image.onerror=abort;image.onload=()=>{
   try{const canvas=document.createElement('canvas');const scale=Math.min(1,80/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);finish(coverColorFromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data));}catch{finish(null);}
  };
  image.src=imageUrl(reference);
 });
}
