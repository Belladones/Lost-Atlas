import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mentionParts,wordCount,initial} from './model.js';
test('les alias et noms complets pointent vers la même fiche',()=>{const p=mentionParts('Cassie rejoint Cassiopée Leroux et Léo.',initial.projects[0].entities);assert.deepEqual(p.filter(x=>x.id).map(x=>x.id),['cassie','cassie','leo']);});
test('ne lie pas un nom à l’intérieur d’un mot',()=>assert.equal(mentionParts('Léonie',initial.projects[0].entities).some(x=>x.id),false));
test('les caractères spéciaux restent littéraux',()=>assert.equal(mentionParts('A+B arrive',[{id:'x',name:'A+B',alias:''}])[0].id,'x'));
test('compte les mots sans compter les espaces',()=>{assert.equal(wordCount('  un\n deux '),2);assert.equal(wordCount(''),0);});
