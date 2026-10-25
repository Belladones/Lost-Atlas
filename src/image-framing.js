export const defaultFraming={x:50,y:50,zoom:1};
export function framingStyle(framing){
 if(!framing)return {};
 const {x,y,zoom}=framing;
 return {objectPosition:`${x}% ${y}%`,transform:`scale(${zoom})`,transformOrigin:`${x}% ${y}%`};
}
