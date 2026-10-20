export const uid = () => crypto.randomUUID();
export const initial = {
  projects: [{id:'meridian', name:'Les Murmures de Meridian', genre:'Dark fantasy · Mystère', description:'Une petite ville, une forêt sans fin et des secrets que personne ne devrait découvrir.', color:'#b7a279', entities:[
    {id:'cassie',name:'Cassiopée Leroux',alias:'Cassie, Cassiopée',type:'Personnage',role:'Personnage principal',description:'12 ans. Cynique, impulsive et courageuse. Passionnée de dessin, Cassie apprend à accorder sa confiance.',symbol:'CL'},
    {id:'leo',name:'Léo Moreau',alias:'Léo',type:'Personnage',role:'Le meilleur ami',description:'Toujours un carnet dans la poche. Léo connaît les chemins de la forêt et garde ses propres secrets.',symbol:'LM'},
    {id:'institute',name:'Meridian Helix Institute',alias:'Institut, Helix',type:'Organisation',role:'Institut de recherche',description:'Un centre scientifique à la lisière de la ville. Ses portes sont fermées depuis des années. Du moins, officiellement.',symbol:'MH'},
    {id:'forest',name:'La forêt des Échos',alias:'forêt des Échos',type:'Lieu',role:'Au-delà de Meridian',description:'Les habitants évitent ses sentiers après le crépuscule. On raconte que les arbres se souviennent.',symbol:'FÉ'}
  ],chapters:[{id:'ch1',title:'Les murmures de la forêt',status:'En cours',text:'La pluie tombait depuis plusieurs heures lorsque Cassie franchit les grilles du collège. Elle aperçut Léo qui l’attendait près des casiers.\n\n« Tu as entendu ce qu’ils racontent sur le Meridian Helix Institute ? »\n\nCassie haussa les épaules. Elle avait déjà suffisamment de problèmes. Pourtant, le dessin dans son carnet semblait avoir changé pendant la nuit.\n\nAu loin, la forêt des Échos disparaissait dans la brume.'},{id:'ch2',title:'Ce que la nuit emporte',status:'Idée',text:''}],relations:[{from:'cassie',to:'leo',label:'Amitié · Une confiance fragile'},{from:'cassie',to:'institute',label:'Un passé à découvrir'}]}],active:'meridian'
};
export function wordCount(text){return text.trim()?text.trim().split(/\s+/u).length:0;}
export function mentionParts(text,entities){
 const names=entities.flatMap(e=>[e.name,...e.alias.split(',')].map(n=>({name:n.trim(),id:e.id}))).filter(x=>x.name).sort((a,b)=>b.name.length-a.name.length);
 if(!names.length)return [{text}];
 const escaped=names.map(x=>x.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const re=new RegExp('(?<![\\p{L}\\p{N}_])('+escaped.join('|')+')(?![\\p{L}\\p{N}_])','giu');
 const out=[];let last=0;for(const m of text.matchAll(re)){if(m.index>last)out.push({text:text.slice(last,m.index)});out.push({text:m[0],id:names.find(n=>n.name.toLocaleLowerCase()===m[0].toLocaleLowerCase()).id});last=m.index+m[0].length;}if(last<text.length)out.push({text:text.slice(last)});return out;
}

// All removals preserve unrelated projects and manuscript text.
export function removeItem(library,target){
 if(target.kind==='project'){
  const projects=library.projects.filter(p=>p.id!==target.projectId);
  return {...library,projects,active:projects.some(p=>p.id===library.active)?library.active:projects[0]?.id??null};
 }
 return {...library,projects:library.projects.map(p=>{
  if(p.id!==target.projectId)return p;
  if(target.kind==='entity')return {...p,entities:p.entities.filter(e=>e.id!==target.id),relations:p.relations.filter(r=>r.from!==target.id&&r.to!==target.id)};
  if(target.kind==='chapter')return {...p,chapters:p.chapters.filter(c=>c.id!==target.id)};
  if(target.kind==='relation')return {...p,relations:p.relations.filter((_,i)=>i!==target.index)};
  return p;
 })};
}
