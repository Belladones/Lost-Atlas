import {z} from 'zod';
const id=z.string().min(1).max(100);
const text=z.string().max(1_000_000);
const entity=z.object({id,name:z.string().trim().min(1).max(150),alias:z.string().max(5000),type:z.enum(['Personnage','Lieu','Organisation']),role:z.string().max(1000).default(''),description:text,symbol:z.string().max(20).default('')});
const chapter=z.object({id,title:z.string().max(1000),text,status:z.enum(['Idée','En cours','Terminé'])});
const project=z.object({id,name:z.string().trim().min(1).max(150),genre:z.string().max(1000).default(''),description:text.default(''),color:z.string().max(50).default('#b7a279'),entities:z.array(entity).max(5000),chapters:z.array(chapter).max(5000),relations:z.array(z.object({from:id,to:id,label:z.string().max(1000)})).max(10000)}).superRefine((p,ctx)=>{
 const entities=new Set(p.entities.map(e=>e.id));
 if(entities.size!==p.entities.length||new Set(p.chapters.map(c=>c.id)).size!==p.chapters.length)ctx.addIssue({code:'custom',message:'Identifiants dupliqués.'});
 if(p.relations.some(r=>!entities.has(r.from)||!entities.has(r.to)))ctx.addIssue({code:'custom',message:'Relation vers une fiche inconnue.'});
});
export const librarySchema=z.object({projects:z.array(project).max(100),active:id.nullable()}).superRefine((d,ctx)=>{
 if(new Set(d.projects.map(p=>p.id)).size!==d.projects.length||(d.projects.length?!d.projects.some(p=>p.id===d.active):d.active!==null))ctx.addIssue({code:'custom',message:'Projet actif invalide ou identifiants dupliqués.'});
});
export const credentialsSchema=z.object({email:z.email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(12).max(256),name:z.string().trim().min(1).max(100).optional()});
