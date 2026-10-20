// A relation always stores both viewpoints in its original from/to order.
export function perspective(relation,entityId){
 const from=relation.from===entityId;
 return {otherId:from?relation.to:relation.from,outgoing:(from?relation.fromDescription:relation.toDescription)||'',incoming:(from?relation.toDescription:relation.fromDescription)||''};
}
export function replaceRelation(relations,index,value){
 return index===undefined?[...relations,value]:relations.map((r,i)=>i===index?{...r,...value}:r);
}
