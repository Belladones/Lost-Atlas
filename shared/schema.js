import {z} from 'zod';
import {characterSections} from './character.js';
const id=z.string().min(1).max(100);
const text=z.string().max(1_000_000);
const imageId=z.uuid().nullable().optional();
const character=z.object(Object.fromEntries(characterSections.flatMap(s=>s.fields.map(([key])=>[key,z.string().max(10000).optional()]))));
const entity=z.object({id,name:z.string().trim().min(1).max(150),alias:z.string().max(5000),type:z.enum(['Personnage','Lieu','Organisation']),role:z.string().max(1000).default(''),description:text,symbol:z.string().max(20).default(''),portraitImage:imageId,coverImage:imageId,gallery:z.array(z.object({id:z.uuid(),caption:z.string().max(300).default('')})).max(24).optional(),character:character.optional(),customFields:z.array(z.object({id:z.string().min(1).max(100),label:z.string().trim().min(1).max(100),value:z.string().max(10000)})).max(50).optional()}).superRefine((e,ctx)=>{if(new Set(e.customFields?.map(f=>f.id)).size!==(e.customFields?.length||0))ctx.addIssue({code:'custom',message:'Identifiants de champs personnalisés dupliqués.'});});
const chapter=z.object({id,title:z.string().max(1000),text,status:z.enum(['Idée','En cours','Terminé']),coverImage:imageId});
export const relationSchema=z.object({id:id.optional(),from:id,to:id,label:z.string().max(1000),fromDescription:z.string().max(10000).default(''),toDescription:z.string().max(10000).default('')});
const project=z.object({id,name:z.string().trim().min(1).max(150),genre:z.string().max(1000).default(''),description:text.default(''),color:z.string().max(50).default('#b7a279'),coverImage:imageId,entities:z.array(entity).max(5000),chapters:z.array(chapter).max(5000),relations:z.array(relationSchema).max(10000)}).superRefine((p,ctx)=>{
 const relationIds=p.relations.flatMap(r=>r.id?[r.id]:[]);
 if(new Set(relationIds).size!==relationIds.length)ctx.addIssue({code:'custom',message:'Identifiants de relations dupliqués.'});
 const entities=new Set(p.entities.map(e=>e.id));
 if(entities.size!==p.entities.length||new Set(p.chapters.map(c=>c.id)).size!==p.chapters.length)ctx.addIssue({code:'custom',message:'Identifiants dupliqués.'});
 if(p.relations.some(r=>!entities.has(r.from)||!entities.has(r.to)))ctx.addIssue({code:'custom',message:'Relation vers une fiche inconnue.'});
});
export const librarySchema=z.object({projects:z.array(project).max(100),active:id.nullable()}).superRefine((d,ctx)=>{
 if(new Set(d.projects.map(p=>p.id)).size!==d.projects.length||(d.projects.length?!d.projects.some(p=>p.id===d.active):d.active!==null))ctx.addIssue({code:'custom',message:'Projet actif invalide ou identifiants dupliqués.'});
});
export const credentialsSchema=z.object({email:z.email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(12).max(256),name:z.string().trim().min(1).max(100).optional()});
