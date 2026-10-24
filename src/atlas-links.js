// Citation links navigate only within the library already loaded for this account.
export function atlasLink(data,search){
 const params=new URLSearchParams(search),project=data.projects.find(p=>p.id===params.get('atlasProject'));
 if(!project)return {};
 const entity=project.entities.find(e=>e.id===params.get('atlasEntity'));
 const chapter=!entity&&project.chapters.find(c=>c.id===params.get('atlasChapter'));
 return {projectId:project.id,entityId:entity?.id||null,chapterId:chapter?.id||null};
}
