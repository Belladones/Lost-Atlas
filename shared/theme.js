export const DEFAULT_BACKGROUND='#161615';
export function darkCoverColor({r,g,b}){
 const channels=[r,g,b],max=Math.max(...channels),min=Math.min(...channels);
 if(!max)return DEFAULT_BACKGROUND;
 const chroma=(max-min)/max;
 return '#'+channels.map((value,i)=>Math.max(18,Math.min(32,Math.round([22,22,21][i]+(value/max-.5)*14*chroma))).toString(16).padStart(2,'0')).join('');
}
