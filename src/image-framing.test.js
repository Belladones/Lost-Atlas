import {test} from 'node:test';
import assert from 'node:assert/strict';
import {librarySchema} from '../shared/schema.js';
import {initial} from './model.js';
import {remapMedia} from '../shared/media.js';

test('le cadrage de chaque image survit à la validation et à un export/import',()=>{
 const data=structuredClone(initial),p=data.projects[0],e=p.entities[0],c=p.chapters[0];
 const framing={x:15,y:80,zoom:2.25},id='a4b8512e-4481-4bde-b7a0-912d98207c40';
 p.coverImage=id;p.coverFraming=framing;c.coverImage=id;c.coverFraming=framing;
 e.coverImage=id;e.coverFraming=framing;e.portraitImage=id;e.portraitFraming=framing;e.gallery=[{id,caption:'Test',framing}];
 const parsed=librarySchema.parse(JSON.parse(JSON.stringify(data)));
 const restored=remapMedia(parsed,new Map([[id,'dc14af01-16af-4132-b6fb-716aa75db716']]));
 assert.deepEqual(restored.projects[0].coverFraming,framing);
 assert.deepEqual(restored.projects[0].chapters[0].coverFraming,framing);
 assert.deepEqual(restored.projects[0].entities[0].portraitFraming,framing);
 assert.deepEqual(restored.projects[0].entities[0].coverFraming,framing);
 assert.deepEqual(restored.projects[0].entities[0].gallery[0].framing,framing);
});
test('les anciennes bibliothèques restent valides et les cadrages hors limites sont refusés',()=>{
 assert.equal(librarySchema.safeParse(initial).success,true);
 for(const framing of [{x:-1,y:50,zoom:1},{x:50,y:101,zoom:1},{x:50,y:50,zoom:4}]){
 const data=structuredClone(initial);data.projects[0].coverFraming=framing;
 assert.equal(librarySchema.safeParse(data).success,false);
 }
});
