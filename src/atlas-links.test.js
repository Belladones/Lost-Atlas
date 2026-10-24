import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atlasLink} from './atlas-links.js';
import {initial} from './model.js';
test('les liens de citation ouvrent uniquement un projet et un élément du compte connecté',()=>{
 assert.deepEqual(atlasLink(initial,'?atlasProject=meridian&atlasEntity=leo'),{projectId:'meridian',entityId:'leo',chapterId:null});
 assert.deepEqual(atlasLink(initial,'?atlasProject=meridian&atlasChapter=ch1'),{projectId:'meridian',entityId:null,chapterId:'ch1'});
 assert.deepEqual(atlasLink(initial,'?atlasProject=other-account&atlasEntity=leo'),{});
 assert.deepEqual(atlasLink(initial,'?atlasProject=meridian&atlasEntity=unknown'),{projectId:'meridian',entityId:null,chapterId:null});
});
