import {entitySchema,chapterSchema,librarySchema} from '../shared/schema.js';
import {characterSections} from '../shared/character.js';
import {isExternalImage} from '../shared/media.js';
export const importTypes=['Personnage','Lieu','Organisation','Chapitre'];
export const importLimit=200;
const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const characterColumns=characterSections.flatMap(s=>s.fields.map(([key,label])=>[normalize(label),key]));
export function importColumns(type){return type==='Chapitre'?['titre','texte','statut','image_couverture']:['nom','alias','role','description','image_portrait','image_couverture',...(type==='Personnage'?characterColumns.map(([column])=>column):[])];}
export function importTemplate(type){
 if(!importTypes.includes(type))throw Error('Type d’import inconnu.');
 const examples={Personnage:{nom:'Maëlys',alias:'Mae',role:'Protagoniste',description:'Une cartographe en quête d’un rivage oublié.',age:'28',pronoms:'elle'},Lieu:{nom:'Le phare des Brumes',role:'Refuge',description:'Un phare au bord des îles oubliées.'},Organisation:{nom:'La Guilde des Cartographes',role:'Guilde',description:'Ses membres dessinent les frontières du monde.'},Chapitre:{titre:'Le dernier phare',texte:'Maëlys ouvre enfin la carte.\n\nUne nouvelle histoire commence.',statut:'Idée'}};
 const columns=importColumns(type),quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 return '\uFEFF'+[columns,columns.map(c=>examples[type][c]||'')].map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n';
}
export function parseCsv(source){
 if(typeof source!=='string')throw Error('Fichier CSV invalide.');
 source=source.replace(/^\uFEFF/,'');let quoted=false,semicolons=0,commas=0;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted){if(c==='\n'||c==='\r')break;if(c===';')semicolons++;if(c===',')commas++;}}
 const separator=semicolons>=commas?';':',';const rows=[];let row=[],field='',inside=false,closed=false;
 function addRow(){row.push(field);if(row.some(v=>v.trim()))rows.push(row);if(rows.length>importLimit+1)throw Error(`Limite de ${importLimit} éléments par import.`);row=[];field='';closed=false;}
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(inside){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{inside=false;closed=true;}}else field+=c;continue;}
  if(c===separator){row.push(field);field='';closed=false;}else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;addRow();}else if(c==='"'){if(field||closed)throw Error('Guillemets CSV mal placés.');inside=true;}else{if(closed)throw Error('Caractère inattendu après un champ entre guillemets.');field+=c;}
 }
 if(inside)throw Error('Un champ entre guillemets n’est pas fermé.');if(field||row.length||closed)addRow();
 if(rows.length<2)throw Error('Le fichier doit contenir un en-tête et au moins un élément.');return rows;
}
export function readRecordImport(source,type){
 if(!importTypes.includes(type))throw Error('Type d’import inconnu.');
 if(new TextEncoder().encode(source).length>2*1024*1024)throw Error('Le fichier dépasse la limite de 2 Mo.');
 const [rawHeaders,...rows]=parseCsv(source),headers=rawHeaders.map(normalize),allowed=importColumns(type),required=type==='Chapitre'?'titre':'nom';
 if(new Set(headers).size!==headers.length)throw Error('Des noms de colonnes sont en double.');
 if(!headers.includes(required))throw Error(`La colonne « ${required} » est obligatoire pour ce type d’import.`);
 const unknown=headers.filter(h=>!allowed.includes(h));if(unknown.length)throw Error('Colonnes inconnues : '+unknown.join(', ')+'. Utilisez le modèle du type sélectionné.');
 const errors=[],records=[];
 rows.forEach((values,index)=>{
  const prefix=`Élément ${index+1}`;if(values.length!==headers.length){errors.push(`${prefix} : le nombre de cellules ne correspond pas à l’en-tête.`);return;}
  const fields=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
  if(!fields[required]?.trim()){errors.push(`${prefix} : « ${required} » est obligatoire.`);return;}
  for(const column of ['image_portrait','image_couverture'])if(fields[column]?.trim()&&!isExternalImage(fields[column].trim())){errors.push(`${prefix} : « ${column} » doit être un lien HTTPS public sans identifiants.`);return;}
  const cover=fields.image_couverture?.trim()||null;let record;
  if(type==='Chapitre')record={id:crypto.randomUUID(),title:fields.titre.trim(),text:fields.texte||'',status:fields.statut?.trim()||'Idée',coverImage:cover};
  else record={id:crypto.randomUUID(),name:fields.nom.trim(),type,alias:fields.alias?.trim()||'',role:fields.role?.trim()||'',description:fields.description||'',symbol:Array.from(fields.nom.trim()).slice(0,2).join('').toUpperCase(),portraitImage:fields.image_portrait?.trim()||null,coverImage:cover,...(type==='Personnage'?{character:Object.fromEntries(characterColumns.filter(([column])=>fields[column]).map(([column,key])=>[key,fields[column]]))}:{})};
  const parsed=(type==='Chapitre'?chapterSchema:entitySchema).safeParse(record);
  if(!parsed.success){const issue=parsed.error.issues[0];errors.push(`${prefix} : ${type==='Chapitre'&&issue.path[0]==='status'?'statut attendu : Idée, En cours ou Terminé.':'champ « '+issue.path.join('.')+' » invalide ou trop long.'}`);return;}
  records.push(parsed.data);
 });
 if(errors.length)throw Error(errors.slice(0,8).join('\n')+(errors.length>8?`\n… et ${errors.length-8} autre(s) erreur(s).`:''));return records;
}
export function planRecordImport(project,type,records,skipDuplicates=true){
 const chapter=type==='Chapitre',key=chapter?'title':'name',existing=chapter?project.chapters:project.entities.filter(e=>e.type===type);const seen=new Set(existing.map(e=>e[key].trim().toLocaleLowerCase('fr')));
 return records.map(record=>{const value=record[key].trim().toLocaleLowerCase('fr'),duplicate=seen.has(value);seen.add(value);return{record,duplicate,skip:skipDuplicates&&duplicate};});
}
export function appendRecordImport(data,projectId,type,records){
 const project=data.projects.find(p=>p.id===projectId);if(!project)throw Error('Le projet n’existe plus.');if(!records.length)throw Error('Aucun élément à importer.');
 const key=type==='Chapitre'?'chapters':'entities';const next={...data,projects:data.projects.map(p=>p.id===projectId?{...p,[key]:[...p[key],...records]}:p)};
 if(!librarySchema.safeParse(next).success)throw Error('L’import dépasse les limites du projet ou contient des données invalides.');
 if(new TextEncoder().encode(JSON.stringify({data:next,revision:0})).length>5*1024*1024-1024)throw Error('La bibliothèque dépasserait la limite de 5 Mo. Réduisez le fichier à importer.');return next;
}
