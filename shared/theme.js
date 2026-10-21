export const DEFAULT_BACKGROUND='#161615';
export function darkCoverColor({r,g,b}){
 const channels=[r,g,b],max=Math.max(...channels),min=Math.min(...channels);
 if(!max)return DEFAULT_BACKGROUND;
 const chroma=(max-min)/max;
 // A visible, muted tint: keep the original charcoal character and low luminance.
 return '#'+channels.map((value,i)=>Math.max(18,Math.min(46,Math.round([22,22,21][i]+(value/max-.3)*30*chroma))).toString(16).padStart(2,'0')).join('');
}
export function coverColorFromPixels(pixels){
 const buckets=new Map();let neutral=[0,0,0],neutralWeight=0;
 for(let i=0;i<pixels.length;i+=4){
  const r=pixels[i],g=pixels[i+1],b=pixels[i+2],alpha=pixels[i+3]/255;
  if(alpha<.5)continue;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),saturation=max?(max-min)/max:0;
  if(max<35||saturation<.12){neutral=neutral.map((n,j)=>n+[r,g,b][j]*alpha);neutralWeight+=alpha;continue;}
  // Ignore almost black/neutral pixels rather than letting a gray sky or border
  // erase the main colored area. Quantization keeps similar shades together.
  const key=[r,g,b].map(v=>v>>5).join(',');const weight=alpha*(.25+saturation);
  const bucket=buckets.get(key)||{weight:0,r:0,g:0,b:0};bucket.weight+=weight;bucket.r+=r*weight;bucket.g+=g*weight;bucket.b+=b*weight;buckets.set(key,bucket);
 }
 const dominant=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];
 if(dominant)return darkCoverColor({r:dominant.r/dominant.weight,g:dominant.g/dominant.weight,b:dominant.b/dominant.weight});
 return neutralWeight?darkCoverColor({r:neutral[0]/neutralWeight,g:neutral[1]/neutralWeight,b:neutral[2]/neutralWeight}):DEFAULT_BACKGROUND;
}
