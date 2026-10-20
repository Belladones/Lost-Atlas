import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutGraph,graphEdges,edgePaths,fitGraph,GRAPH_WIDTH,GRAPH_HEIGHT} from './graph-layout.js';
import {initial} from './model.js';
test('le graphe inclut toutes les fiches, même sans relation',()=>{
 const p=initial.projects[0],nodes=layoutGraph(p.entities,p.relations);assert.equal(nodes.length,p.entities.length);assert.ok(nodes.some(n=>n.id==='forest'));assert.equal(new Set(nodes.map(n=>`${n.x}:${n.y}`)).size,nodes.length);assert.ok(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 const edges=graphEdges(p.relations,nodes);assert.equal(edges.length,p.relations.length);assert.ok(edges.every(e=>e.forward&&e.reverse&&e.forward!==e.reverse));
});
test('les cas vides, à une fiche et sans liens restent exploitables',()=>{
 assert.deepEqual(layoutGraph([],[]),[]);assert.deepEqual(fitGraph([]),{x:0,y:0,scale:1});const one=layoutGraph([{id:'a'}],[]);assert.equal(one[0].x,0);assert.equal(one[0].y,0);assert.equal(layoutGraph([{id:'a'},{id:'b'}],[]).length,2);assert.deepEqual(graphEdges([],one),[]);
});
test('les liens multiples et inversés sont dessinés séparément',()=>{
 const nodes=[{id:'a',x:-200,y:0},{id:'b',x:200,y:0}],relations=[{from:'a',to:'b'},{from:'b',to:'a'},{from:'a',to:'b'}];const edges=graphEdges(relations,nodes);assert.equal(edges.length,3);assert.equal(new Set(edges.map(e=>e.forward)).size,3);assert.ok(edges.every(e=>!e.forward.includes('NaN')&&!e.reverse.includes('NaN')));
});
test('les liens sur soi-même et les fiches superposées ne produisent pas de coordonnées invalides',()=>{
 const a={id:'a',x:0,y:0},b={id:'b',x:0,y:0};for(const paths of [edgePaths(a,a),edgePaths(a,b)]){assert.ok(paths.forward.includes('C'));assert.notEqual(paths.forward,paths.reverse);assert.ok(!paths.forward.includes('NaN'));}assert.equal(graphEdges([{from:'a',to:'missing'}],[a]).length,0);
});
test('le cadrage conserve les grands graphes dans la zone visible',()=>{
 const entities=Array.from({length:300},(_,i)=>({id:String(i)})),nodes=layoutGraph(entities,[]),view=fitGraph(nodes);assert.ok(view.scale>0);for(const node of nodes){assert.ok(Math.abs(node.x*view.scale+view.x)<GRAPH_WIDTH/2);assert.ok(Math.abs(node.y*view.scale+view.y)<GRAPH_HEIGHT/2);}
});
test('les flèches des boucles restent à l’extérieur des grands nœuds sur mobile',()=>{
 const radius=65,paths=edgePaths({id:'a',x:0,y:0},{id:'a',x:0,y:0},0,radius);
 for(const path of [paths.forward,paths.reverse]){const numbers=path.match(/-?\d+(?:\.\d+)?/g).map(Number);assert.ok(Math.hypot(numbers[0],numbers[1])>radius);assert.ok(Math.hypot(numbers.at(-2),numbers.at(-1))>radius);}
});
