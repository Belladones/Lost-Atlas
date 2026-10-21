// External images are fetched directly by the browser, never by the API.
export function isExternalImage(value){
 if(typeof value!=='string'||value.length>4096||!/^https:\/\/\S+$/i.test(value))return false;
 try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
export function mediaIds(data){
 const ids=new Set();
 for(const p of data.projects){if(p.coverImage)ids.add(p.coverImage);for(const c of p.chapters)if(c.coverImage)ids.add(c.coverImage);for(const e of p.entities){if(e.portraitImage)ids.add(e.portraitImage);if(e.coverImage)ids.add(e.coverImage);for(const image of e.gallery||[])ids.add(image.id);}}
 return [...ids].filter(id=>!isExternalImage(id));
}
export function remapMedia(data,mapping){
 const map=id=>id&&!isExternalImage(id)?(mapping.get(id)||id):id;
 return {...data,projects:data.projects.map(p=>({...p,coverImage:map(p.coverImage),chapters:p.chapters.map(c=>({...c,coverImage:map(c.coverImage)})),entities:p.entities.map(e=>({...e,portraitImage:map(e.portraitImage),coverImage:map(e.coverImage),gallery:e.gallery?.map(i=>({...i,id:map(i.id)}))}))}))};
}
