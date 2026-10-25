export const GRAPH_WIDTH=1100,GRAPH_HEIGHT=660;
// Work with unique, undirected links: viewpoints and duplicate relations must not
// change the geometry. Sorting IDs makes the layout independent of list order.
export function layoutGraph(entities,relations){
 if(!entities.length)return [];
 const ordered=[...entities].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
 const adjacency=new Map(ordered.map(e=>[e.id,new Set()]));
 for(const {from,to} of relations){
  if(from===to||!adjacency.has(from)||!adjacency.has(to))continue;
  adjacency.get(from).add(to);adjacency.get(to).add(from);
 }
 const seen=new Set(),components=[];
 for(const entity of ordered){
  if(seen.has(entity.id))continue;
  const ids=[entity.id];seen.add(entity.id);
  for(let i=0;i<ids.length;i++)for(const id of [...adjacency.get(ids[i])].sort())if(!seen.has(id)){seen.add(id);ids.push(id);}
  components.push(ids);
 }
 components.sort((a,b)=>b.length-a.length);
 const positions=new Map(),boxes=[];
 for(const ids of components){
  const index=new Map(ids.map((id,i)=>[id,i])),count=ids.length;
  const depths=new Map([[ids[0],0]]),levels=new Map();
  for(const id of ids){const depth=depths.get(id);for(const next of adjacency.get(id))if(!depths.has(next))depths.set(next,depth+1);if(!levels.has(depth))levels.set(depth,[]);levels.get(depth).push(id);}
  const nodes=ids.map(id=>{const depth=depths.get(id),level=levels.get(depth);return {id,x:depth*270,y:(level.indexOf(id)-(level.length-1)/2)*260};});
  const links=[];
  for(let i=0;i<count;i++)for(const id of adjacency.get(ids[i]))if(index.get(id)>i)links.push([i,index.get(id)]);
  // A cooling force simulation keeps neighbours close while leaving space for
  // portraits and labels. Each connected component is solved independently.
  for(let step=0;step<240&&count>1;step++){
   const forces=nodes.map(()=>({x:0,y:0}));
   for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
    const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,distance=Math.max(1,Math.hypot(dx,dy));
    const strength=18000/(distance*distance)+Math.max(0,245-distance)*.25;
    const fx=dx/distance*strength,fy=dy/distance*strength;
    forces[i].x+=fx;forces[i].y+=fy;forces[j].x-=fx;forces[j].y-=fy;
   }
   for(const [i,j] of links){
    const dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,distance=Math.max(1,Math.hypot(dx,dy));
    const strength=(distance-270)*.045,fx=dx/distance*strength,fy=dy/distance*strength;
    forces[i].x+=fx;forces[i].y+=fy;forces[j].x-=fx;forces[j].y-=fy;
   }
   const temperature=22*(1-step/240)+.2;
   for(let i=0;i<count;i++){
    const f=forces[i],length=Math.max(1,Math.hypot(f.x,f.y)),scale=Math.min(1,temperature/length);
    nodes[i].x+=f.x*scale;nodes[i].y+=f.y*scale;
   }
  }
  const left=Math.min(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y));
  const width=Math.max(...nodes.map(n=>n.x))-left+280,height=Math.max(...nodes.map(n=>n.y))-top+220;
  boxes.push({nodes,left,top,width,height});
 }
 // Pack disconnected groups with a clear gutter, including isolated entities.
 const targetWidth=Math.max(...boxes.map(b=>b.width),Math.sqrt(boxes.reduce((sum,b)=>sum+b.width*b.height,0)*1.6));
 let x=0,y=0,rowHeight=0;
 for(const box of boxes){
  if(x>0&&x+box.width>targetWidth){x=0;y+=rowHeight+100;rowHeight=0;}
  for(const node of box.nodes)positions.set(node.id,{x:node.x-box.left+x+140,y:node.y-box.top+y+110});
  x+=box.width+100;rowHeight=Math.max(rowHeight,box.height);
 }
 const all=[...positions.values()],cx=(Math.min(...all.map(n=>n.x))+Math.max(...all.map(n=>n.x)))/2,cy=(Math.min(...all.map(n=>n.y))+Math.max(...all.map(n=>n.y)))/2;
 return entities.map(e=>({...e,x:positions.get(e.id).x-cx,y:positions.get(e.id).y-cy}));
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
