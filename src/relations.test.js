import {test} from 'node:test';
import assert from 'node:assert/strict';
import {perspective,replaceRelation} from '../shared/relations.js';
import {librarySchema,relationSchema} from '../shared/schema.js';
import {initial} from './model.js';
const relation={from:'cassie',to:'leo',label:'Un amour à sens unique',fromDescription:'Cassie est amoureuse de Léo.',toDescription:'Léo voit Cassie comme une amie.'};
test('les points de vue sont orientés correctement dans chaque fiche',()=>{
 assert.deepEqual(perspective(relation,'cassie'),{otherId:'leo',outgoing:relation.fromDescription,incoming:relation.toDescription});
 assert.deepEqual(perspective(relation,'leo'),{otherId:'cassie',outgoing:relation.toDescription,incoming:relation.fromDescription});
});
test('une ancienne relation reste compatible sans inventer de points de vue',()=>{
 const old={from:'cassie',to:'leo',label:'Amitié'};const value=relationSchema.parse(old);assert.equal(value.fromDescription,'');assert.equal(value.toDescription,'');assert.equal(value.label,'Amitié');assert.equal(perspective(old,'leo').outgoing,'');
 assert.equal(librarySchema.safeParse(initial).success,true);
});
test('une seule explication peut être renseignée et les limites sont validées',()=>{
 assert.equal(relationSchema.parse({...relation,toDescription:undefined}).toDescription,'');assert.equal(relationSchema.safeParse({...relation,fromDescription:42}).success,false);assert.equal(relationSchema.safeParse({...relation,toDescription:'a'.repeat(10001)}).success,false);
});
test('éditer une relation ne la duplique pas et conserve les autres liens',()=>{
 const other={from:'leo',to:'institute',label:'Méfiance'};const source=[relation,other];const edited=replaceRelation(source,0,{...relation,fromDescription:'Cassie se méfie désormais.'});assert.equal(edited.length,2);assert.equal(edited[0].toDescription,relation.toDescription);assert.equal(edited[1],other);assert.equal(source[0].fromDescription,relation.fromDescription);assert.equal(replaceRelation(source,undefined,{from:'leo',to:'forest',label:'Curiosité'}).length,3);
});
test('les exports conservent les deux descriptions et les anciens liens sans id',()=>{
 const data=structuredClone(initial);data.projects[0].relations[0]={...relation,id:'relation-1'};const imported=librarySchema.parse(JSON.parse(JSON.stringify(data)));assert.deepEqual(imported.projects[0].relations[0],data.projects[0].relations[0]);data.projects[0].relations[1].id='relation-1';assert.equal(librarySchema.safeParse(data).success,false);
});
