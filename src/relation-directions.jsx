import React from 'react';
import {ArrowRight} from 'lucide-react';
export function RelationDirections({relation,from,to,focusId}){
 const directions=[{key:'forward',code:'A → B',from:from?.name||'Fiche A',to:to?.name||'Fiche B',text:relation.fromDescription},{key:'reverse',code:'B → A',from:to?.name||'Fiche B',to:from?.name||'Fiche A',text:relation.toDescription}];
 if(focusId===relation.to&&relation.from!==relation.to)directions.reverse();
 return <div className="relation-directions">{directions.map(d=><article className={'relation-direction '+d.key} key={d.key}><div className="direction-caption"><span>{d.code}</span><strong>{d.from} <ArrowRight size={12}/> {d.to}</strong></div><p className={d.text?'':'unfilled'}>{d.text||'Point de vue non renseigné.'}</p></article>)}</div>;
}
