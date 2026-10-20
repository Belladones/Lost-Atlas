export const GRAPH_WIDTH=1100,GRAPH_HEIGHT=660;
export function layoutGraph(entities,relations){
 if(!entities.length)return [];
 if(entities.length===1)return [{...entities[0],x:0,y:0}];
 const degrees=new Map(entities.map(e=>[e.id,0]));
 for(const r of relations){if(degrees.has(r.from))degrees.set(r.from,degrees.get(r.from)+1);if(degrees.has(r.to))degrees.set(r.to,degrees.get(r.to)+1);}
 const hub=entities.reduce((best,e)=>(degrees.get(e.id)>degrees.get(best.id)?e:best),entities[0]);
 const center=entities.length>2&&degrees.get(hub.id)>=2?hub.id:null;
 const orbit=entities.filter(e=>e.id!==center),radius=Math.max(200,orbit.length*26);
 const result=orbit.map((e,i)=>{const angle=-Math.PI/2+2*Math.PI*i/orbit.length;return {...e,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
 if(center)result.unshift({...hub,x:0,y:0});
 return result;
}
export function fitGraph(nodes,width=GRAPH_WIDTH,height=GRAPH_HEIGHT){
 if(!nodes.length)return {x:0,y:0,scale:1};
 const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),left=Math.min(...xs)-125,right=Math.max(...xs)+125,top=Math.min(...ys)-75,bottom=Math.max(...ys)+90;
 const scale=Math.max(.001,Math.min(1.7,(width-100)/(right-left),(height-90)/(bottom-top)));
 return {x:-(left+right)/2*scale,y:-(top+bottom)/2*scale,scale};
}
export function edgePaths(a,b,lane=0,nodeRadius=31){
 const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
 if(distance<1){const bend=Math.max(110,nodeRadius*3)+Math.abs(lane),x=a.x,y=a.y,sx=(nodeRadius+5)*.5,sy=(nodeRadius+5)*.9;return {forward:`M ${x+sx} ${y-sy} C ${x+bend} ${y-bend} ${x+bend} ${y+bend} ${x+sx} ${y+sy}`,reverse:`M ${x-sx} ${y+sy} C ${x-bend} ${y+bend} ${x-bend} ${y-bend} ${x-sx} ${y-sy}`,x:x+bend,y:y-75};}
 const ux=dx/distance,uy=dy/distance,nx=-uy,ny=ux,mx=(a.x+b.x)/2,my=(a.y+b.y)/2,offset=Math.min(nodeRadius+5,distance/3);
 const start=`${a.x+ux*offset} ${a.y+uy*offset}`,end=`${b.x-ux*offset} ${b.y-uy*offset}`;
 return {forward:`M ${start} Q ${mx+nx*(lane+15)} ${my+ny*(lane+15)} ${end}`,reverse:`M ${end} Q ${mx+nx*(lane-15)} ${my+ny*(lane-15)} ${start}`,x:mx+nx*lane/2,y:my+ny*lane/2};
}
export function graphEdges(relations,nodes,nodeRadius=31){
 const positions=new Map(nodes.map(n=>[n.id,n])),groups=new Map();
 const keyOf=r=>JSON.stringify([r.from,r.to].sort());
 for(const r of relations){const key=keyOf(r);if(!groups.has(key))groups.set(key,{total:0,next:0});groups.get(key).total++;}
 return relations.flatMap((r,index)=>{const a=positions.get(r.from),b=positions.get(r.to);if(!a||!b)return [];const group=groups.get(keyOf(r)),lane=(group.next++-(group.total-1)/2)*75*(r.from<=r.to?1:-1);return [{index,relation:r,from:a,to:b,...edgePaths(a,b,lane,nodeRadius)}];});
}
