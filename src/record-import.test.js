import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTypes,importTemplate,readRecordImport,parseCsv,planRecordImport,appendRecordImport} from './record-import.js';
import {initial} from './model.js';
test('les quatre modèles se réimportent avec des identifiants neufs et des champs adaptés',()=>{
 for(const type of importTypes){const template=importTemplate(type),a=readRecordImport(template,type),b=readRecordImport(template,type);assert.equal(a.length,1);assert.notEqual(a[0].id,b[0].id);if(type==='Chapitre'){assert.equal(a[0].status,'Idée');assert.ok(a[0].text.includes('\n\n'));}else assert.equal(a[0].type,type);if(type==='Personnage'){assert.equal(a[0].character.age,'28');assert.equal(a[0].character.pronouns,'elle');}}
});
test('CSV point-virgule, virgule, BOM, guillemets échappés et retours à la ligne',()=>{
 assert.deepEqual(parseCsv('\uFEFFnom;description\r\n"Une île";"Deux lignes\navec ""guillemets""; ici"\r\n'),[['nom','description'],['Une île','Deux lignes\navec "guillemets"; ici']]);
 const [r]=readRecordImport('titre,texte,statut\n"Un chapitre","Un texte, avec virgule",Terminé','Chapitre');assert.equal(r.text,'Un texte, avec virgule');assert.equal(r.status,'Terminé');
});
test('refuse un type erroné, colonnes inconnues, CSV mal formé et données invalides avant tout ajout',()=>{
 for(const [csv,type]of [['titre\nA','Lieu'],['nom;secret\nA;B','Lieu'],['nom;nom\nA;B','Lieu'],['nom;description\nA','Lieu'],['nom\n"incomplet','Lieu'],['nom\n"A"suite','Lieu'],['titre;statut\nA;Inconnu','Chapitre'],['nom;image_portrait\nA;http://example.test/a.jpg','Personnage'],['nom;image_couverture\nA;not-a-private-media-id','Lieu'],['nom;description\n;A','Lieu']])assert.throws(()=>readRecordImport(csv,type));
 assert.throws(()=>readRecordImport('nom\n'+Array.from({length:201},(_,i)=>'Nom '+i).join('\n'),'Lieu'),/200/);
 assert.throws(()=>readRecordImport('nom\n'+'a'.repeat(2*1024*1024),'Lieu'),/2 Mo/);
});
test('les doublons sont signalés par type, jamais remplacés, et l’import préserve les autres projets et relations',()=>{
 const data=structuredClone(initial),project=data.projects[0],original=JSON.stringify(data);const records=readRecordImport('nom;description\nLéo Moreau;Version importée\nNouveau;Une fiche\nnouveau;Autre fiche','Personnage');const plan=planRecordImport(project,'Personnage',records);assert.deepEqual(plan.map(p=>p.skip),[true,false,true]);assert.equal(planRecordImport(project,'Lieu',records).filter(p=>p.skip).length,1);
 assert.equal(planRecordImport(project,'Personnage',records,false).filter(p=>!p.skip).length,3);const next=appendRecordImport(data,project.id,'Personnage',plan.filter(p=>!p.skip).map(p=>p.record));assert.equal(next.projects[0].entities.length,5);assert.deepEqual(next.projects[0].relations,project.relations);assert.equal(JSON.stringify(data),original);
 const chapters=readRecordImport('titre;texte\nUn;Première page\nDeux;Seconde page','Chapitre');const appended=appendRecordImport(next,project.id,'Chapitre',chapters);assert.deepEqual(appended.projects[0].chapters.slice(-2).map(c=>c.title),['Un','Deux']);assert.throws(()=>appendRecordImport(data,'missing','Lieu',records));
});
