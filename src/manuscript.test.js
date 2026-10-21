import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findChapters,moveChapter,paginateBook} from './manuscript.js';
const chapters=[{id:'a',title:'Échos',text:'Cassie trouve la forêt.\n\nUn autre monde apparaît.',status:'En cours'},{id:'b',title:'Aube',text:'Léo attend.',status:'Terminé'},{id:'c',title:'Nuit',text:'',status:'Idée'}];
const entities=[{id:'cassie',name:'Cassiopée Leroux',alias:'Cassie'},{id:'leo',name:'Léo Moreau',alias:'Léo'}];
test('recherche dans le titre et le texte sans accents, filtre et tris sans modifier le livre',()=>{
 assert.deepEqual(findChapters(chapters,{query:'echos'}).map(c=>c.id),['a']);assert.deepEqual(findChapters(chapters,{query:'foret'}).map(c=>c.id),['a']);assert.equal(findChapters(chapters,{query:'forêt',status:'Terminé'}).length,0);
 assert.deepEqual(findChapters(chapters,{sort:'title'}).map(c=>c.id),['b','a','c']);assert.deepEqual(findChapters(chapters,{sort:'shortest'}).map(c=>c.id),['c','b','a']);assert.deepEqual(chapters.map(c=>c.id),['a','b','c']);
 const moved=moveChapter(chapters,'b',-1);assert.deepEqual(moved.map(c=>c.id),['b','a','c']);assert.deepEqual(moveChapter(chapters,'a',-1),chapters);assert.deepEqual(moveChapter(chapters,'missing',1),chapters);
});
test('pagination sans perte de texte, dans l’ordre du livre, chapitres vides et mentions cliquables',()=>{
 const pages=paginateBook(chapters,entities,text=>text.length<=20);assert.ok(pages.length>chapters.length);
 for(const chapter of chapters)assert.equal(pages.filter(p=>p.chapterId===chapter.id).flatMap(p=>p.parts).map(p=>p.text).join(''),chapter.text);
 assert.deepEqual([...new Set(pages.map(p=>p.chapterId))],['a','b','c']);assert.equal(pages[0].parts.find(p=>p.id==='cassie').text,'Cassie');assert.equal(pages.find(p=>p.chapterId==='b').parts.find(p=>p.id==='leo').text,'Léo');assert.equal(pages.at(-1).parts.length,0);
});
test('pagination des très longs mots, liens et caractères Unicode, même dans un petit format',()=>{
 const title='Un très long nom de personnage';const input=[{id:'long',title:'Long',text:title+'\n\n'+('🌙'.repeat(80))}];const es=[{id:'long-name',name:title,alias:''}];const pages=paginateBook(input,es,text=>Array.from(text).length<=9);
 assert.equal(pages.flatMap(p=>p.parts).map(p=>p.text).join(''),input[0].text);assert.ok(pages.every(p=>Array.from(p.parts.map(x=>x.text).join('')).length<=9));assert.equal(pages.flatMap(p=>p.parts).filter(p=>p.id).map(p=>p.text).join(''),title);assert.deepEqual(paginateBook([],[],()=>true),[]);
});
