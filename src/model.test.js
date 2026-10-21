import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mentionParts,wordCount,initial} from './model.js';
test('les alias et noms complets pointent vers la même fiche',()=>{const p=mentionParts('Cassie rejoint Cassiopée Leroux et Léo.',initial.projects[0].entities);assert.deepEqual(p.filter(x=>x.id).map(x=>x.id),['cassie','cassie','leo']);});
test('ne lie pas un nom à l’intérieur d’un mot',()=>assert.equal(mentionParts('Léonie',initial.projects[0].entities).some(x=>x.id),false));
test('les caractères spéciaux restent littéraux',()=>assert.equal(mentionParts('A+B arrive',[{id:'x',name:'A+B',alias:''}])[0].id,'x'));
test('compte les mots sans compter les espaces',()=>{assert.equal(wordCount('  un\n deux '),2);assert.equal(wordCount(''),0);});

test('supprimer une fiche nettoie ses relations et conserve le texte des chapitres',async()=>{
 const {removeItem}=await import('./model.js');const result=removeItem(initial,{kind:'entity',projectId:'meridian',id:'cassie'});
 assert.equal(result.projects[0].entities.some(e=>e.id==='cassie'),false);assert.equal(result.projects[0].relations.length,0);
 assert.equal(result.projects[0].chapters[0].text,initial.projects[0].chapters[0].text);assert.equal(initial.projects[0].entities.length,4);
});
test('supprimer le chapitre actif conserve les autres fiches et chapitres',async()=>{
 const {removeItem}=await import('./model.js');const result=removeItem(initial,{kind:'chapter',projectId:'meridian',id:'ch1'});
 assert.deepEqual(result.projects[0].chapters.map(c=>c.id),['ch2']);assert.deepEqual(result.projects[0].entities,initial.projects[0].entities);
});
test('supprimer le dernier projet produit une bibliothèque vide valide',async()=>{
 const {removeItem}=await import('./model.js');const {librarySchema}=await import('../shared/schema.js');const result=removeItem(initial,{kind:'project',projectId:'meridian'});
 assert.deepEqual(result,{projects:[],active:null});assert.equal(librarySchema.safeParse(result).success,true);assert.equal(librarySchema.safeParse({projects:[],active:'absent'}).success,false);
});
test('supprimer un projet inactif conserve la sélection et les autres données',async()=>{
 const {removeItem}=await import('./model.js');const second={...structuredClone(initial.projects[0]),id:'other'};const data={...initial,projects:[...initial.projects,second]};
 assert.equal(removeItem(data,{kind:'project',projectId:'other'}).active,'meridian');assert.equal(removeItem(data,{kind:'project',projectId:'meridian'}).active,'other');
});
test('supprimer une relation ne supprime aucune fiche',async()=>{
 const {removeItem}=await import('./model.js');const result=removeItem(initial,{kind:'relation',projectId:'meridian',index:0});
 assert.equal(result.projects[0].relations.length,1);assert.deepEqual(result.projects[0].entities,initial.projects[0].entities);
});

test('les anciennes fiches et les rôles libres restent compatibles avec les nouveaux champs',async()=>{
 const {librarySchema}=await import('../shared/schema.js');assert.equal(librarySchema.safeParse(initial).success,true);
 const data=structuredClone(initial);data.projects[0].entities[0].role='Gardienne des archives';data.projects[0].entities[0].character={age:'Immortelle',goal:'Retrouver les archives'};data.projects[0].entities[0].customFields=[{id:'a',label:'Devise',value:'Se souvenir'}];
 const parsed=librarySchema.parse(data);assert.equal(parsed.projects[0].entities[0].role,'Gardienne des archives');assert.equal(parsed.projects[0].entities[0].character.age,'Immortelle');data.projects[0].entities[0].customFields.push({id:'a',label:'Autre',value:''});assert.equal(librarySchema.safeParse(data).success,false);
});
test('un import réattribue toutes les images sans altérer les textes et champs personnalisés',async()=>{
 const {mediaIds,remapMedia}=await import('../shared/media.js');const data=structuredClone(initial),p=data.projects[0];p.coverImage='cover';p.chapters[0].coverImage='cover';p.entities[0].portraitImage='portrait';p.entities[0].coverImage='cover';p.entities[0].gallery=[{id:'gallery',caption:'Une idée'}];p.entities[0].customFields=[{id:'x',label:'Devise',value:'Ne pas oublier'}];
 assert.deepEqual(mediaIds(data),['cover','portrait','gallery']);const imported=remapMedia(data,new Map([['cover','new-cover'],['portrait','new-portrait'],['gallery','new-gallery']]));assert.deepEqual(mediaIds(imported),['new-cover','new-portrait','new-gallery']);assert.deepEqual(imported.projects[0].entities[0].customFields,p.entities[0].customFields);assert.equal(imported.projects[0].chapters[0].text,p.chapters[0].text);assert.equal(p.entities[0].portraitImage,'portrait');
});

test('les liens externes sont validés et exclus des images à transférer ou nettoyer',async()=>{
 const {librarySchema}=await import('../shared/schema.js');const {mediaIds,remapMedia,isExternalImage}=await import('../shared/media.js');
 const url='https://images.example.test/a.png?size=large',local='11111111-1111-4111-8111-111111111111';const data=structuredClone(initial),p=data.projects[0];p.coverImage=url;p.chapters[0].coverImage=url;p.entities[0].portraitImage=local;p.entities[0].coverImage=url;p.entities[0].gallery=[{id:url,caption:'Externe'},{id:local,caption:'Privée'}];
 assert.equal(librarySchema.safeParse(data).success,true);assert.deepEqual(mediaIds(data),[local]);
 const imported=remapMedia(data,new Map([[local,'22222222-2222-4222-8222-222222222222'],[url,'do-not-replace-url']]));assert.equal(imported.projects[0].coverImage,url);assert.equal(imported.projects[0].entities[0].gallery[0].id,url);assert.equal(imported.projects[0].entities[0].gallery[1].id,'22222222-2222-4222-8222-222222222222');
 assert.equal(isExternalImage('https://example.test/a.png'),true);assert.equal(isExternalImage('https://'),false);assert.equal(isExternalImage('https://example.test/a b.png'),false);assert.equal(isExternalImage('https://user:secret@example.test/a.png'),false);
});
