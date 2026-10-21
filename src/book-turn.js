// A flexible sheet, divided into strips hinged around the spine.
// Both directions share the same curve; the reverse exposes the verso.
export function curlFrame(progress,width,index,count,direction=1){
 const length=width/count;let x=0,z=0,angle=0;
 for(let i=0;i<=index;i++){
  angle=direction*(-Math.PI*progress+.52*Math.sin(Math.PI*progress)*(1-2*i/(count-1)));
  if(i===index)break;
  x+=direction*length*Math.cos(angle);z-=direction*length*Math.sin(angle);
 }
 if(direction<0){x-=length*Math.cos(angle);z+=length*Math.sin(angle);}
 return `translate3d(${x.toFixed(3)}px,0,${z.toFixed(3)}px) rotateY(${angle.toFixed(6)}rad)`;
}
