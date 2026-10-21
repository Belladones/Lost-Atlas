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

function hexChannels(value){let hex=value.replace('#','');if(hex.length===3||hex.length===4)hex=[...hex].map(c=>c+c).join('');return {rgb:[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)),alpha:hex.slice(6)};}
function hueOf([r,g,b]){const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;if(!delta)return 0;let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;return (hue/6+1)%1;}
function hslToHex(h,s,l){const channel=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return channel(0)+channel(8)+channel(4);}
function colorLuminance(rgb){return rgb.reduce((total,v,i)=>{v/=255;return total+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);}
function tintWithLuminance(hue,saturation,source){
 const target=colorLuminance(source);let low=0,high=1;
 for(let i=0;i<12;i++){const middle=(low+high)/2;const rgb=hexChannels(hslToHex(hue,saturation,middle)).rgb;if(colorLuminance(rgb)<target)low=middle;else high=middle;}
 return hslToHex(hue,saturation,(low+high)/2);
}
export function appearancePalette(coverColor,colors){
 if(!/^#[0-9a-f]{6}$/i.test(coverColor)||coverColor.toLowerCase()===DEFAULT_BACKGROUND)return {};
 const {rgb}=hexChannels(coverColor),hue=hueOf(rgb);const palette={};
 for(const color of colors){
  const {rgb:source,alpha}=hexChannels(color),max=Math.max(...source)/255,min=Math.min(...source)/255,lightness=(max+min)/2;
  // Keep light ivory text and the original brightness hierarchy. Only the hue
  // of surfaces, muted labels, borders and accents follows the project's cover.
  palette['--theme-'+color]=lightness>=.77?'#'+color:'#'+tintWithLuminance(hue,lightness<.4?.23:.19,source)+alpha;
 }
 palette['--appearance-primary']='#'+hslToHex(hue,.22,.78);palette['--appearance-primary-hover']='#'+hslToHex(hue,.22,.84);palette['--appearance-primary-ink']='#'+hslToHex(hue,.2,.1);
 palette['--gold']=palette['--theme-ac9160']||'#ac9160';palette['--ink']=palette['--theme-253b32']||'#253b32';palette['--line']=palette['--theme-36362f']||'#36362f';
 palette['--appearance-button']=palette['--theme-c5b797'];palette['--appearance-line']=palette['--theme-51442e'];palette['--appearance-text']='#e4dfd2';palette['--appearance-muted']=palette['--theme-a99b7e'];palette['--appearance-switch-off']=palette['--theme-181813'];palette['--appearance-switch-on']=palette['--theme-58513b'];palette['--appearance-switch-knob']=palette['--theme-bca87f'];
 return palette;
}
