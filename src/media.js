import {api} from './account';
import {librarySchema} from '../shared/schema';
import {mediaIds,remapMedia,isExternalImage} from '../shared/media';
export const imageUrl=id=>isExternalImage(id)?id:`/api/media/${id}`;
export function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Impossible de lire le fichier.'));reader.readAsDataURL(file);});}
export async function uploadImage(file){if(file.size>3*1024*1024)throw Error('Chaque image doit faire 3 Mo maximum.');return api('/api/media',{method:'POST',body:JSON.stringify({data:await fileBase64(file)})});}
export function downloadJson(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportLibrary(data,name='lost-atlas-bibliotheque.json'){
 const media=[];
 for(const id of mediaIds(data)){
  const response=await fetch(imageUrl(id),{credentials:'same-origin'});if(!response.ok)throw Error('Une image ne peut pas être exportée. Reconnectez-vous puis réessayez.');
  media.push({id,data:await fileBase64(await response.blob())});
 }
 downloadJson(name,{...data,media,formatVersion:2});
}
export async function importLibrary(raw){
 const parsed=librarySchema.safeParse(raw);if(!parsed.success)throw Error('La sauvegarde n’a pas un format Lost Atlas valide.');const data=parsed.data;const ids=mediaIds(data),mapping=new Map();
 if(raw.media!==undefined&&(!Array.isArray(raw.media)||raw.media.length>5000))throw Error('Liste d’images invalide.');
 const embedded=new Map();
 for(const item of raw.media||[]){if(typeof item?.id!=='string'||typeof item.data!=='string'||item.data.length>4*1024*1024||embedded.has(item.id))throw Error('Image invalide dans la sauvegarde.');embedded.set(item.id,item.data);}
 for(const id of ids){
  if(embedded.has(id)){const image=await api('/api/media',{method:'POST',body:JSON.stringify({data:embedded.get(id)})});mapping.set(id,image.id);}
  else{const response=await fetch(imageUrl(id));if(!response.ok)throw Error('Cette sauvegarde ne contient pas toutes ses images. Exportez-la à nouveau depuis le compte d’origine.');}
 }
 return remapMedia(data,mapping);
}
