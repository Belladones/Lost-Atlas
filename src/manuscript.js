import {wordCount,mentionParts} from './model.js';
const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr');
export function findChapters(chapters,{query='',status='',sort='order'}={}){
 const needle=normalize(query.trim());const result=chapters.filter(c=>(!status||c.status===status)&&normalize(c.title+' '+c.text).includes(needle));
 if(sort==='title')result.sort((a,b)=>a.title.localeCompare(b.title,'fr',{numeric:true,sensitivity:'base'}));
 if(sort==='longest')result.sort((a,b)=>wordCount(b.text)-wordCount(a.text));
 if(sort==='shortest')result.sort((a,b)=>wordCount(a.text)-wordCount(b.text));
 return result;
}
export function moveChapter(chapters,id,direction){const index=chapters.findIndex(c=>c.id===id),target=index+direction;if(index<0||target<0||target>=chapters.length)return chapters;const result=[...chapters];[result[index],result[target]]=[result[target],result[index]];return result;}
// A measurement callback uses the reader's real font and available page dimensions.
// Text is retained exactly, and mentions remain linked even for very long names.
export function paginateBook(chapters,entities,fits){
 const pages=[];
 for(const [chapterIndex,chapter] of chapters.entries()){
  let parts=[],text='',chapterPage=0;
  const emit=()=>{pages.push({chapterId:chapter.id,title:chapter.title,chapterIndex,chapterPage:chapterPage++,parts});parts=[];text='';};
  for(const part of mentionParts(chapter.text,entities)){
   const tokens=part.id?[part.text]:(part.text.match(/\s+|\S+/gu)||[]);
   for(let token of tokens){
    if(fits(text+token)){parts.push({text:token,...(part.id?{id:part.id}:{})});text+=token;continue;}
    if(text)emit();
    while(token&&!fits(token)){
     const chars=Array.from(token);let low=1,high=chars.length;
     while(low<high){const middle=Math.ceil((low+high)/2);if(fits(chars.slice(0,middle).join('')))low=middle;else high=middle-1;}
     const chunk=chars.slice(0,low).join('');parts.push({text:chunk,...(part.id?{id:part.id}:{})});text=chunk;token=chars.slice(low).join('');emit();
    }
    if(token){parts.push({text:token,...(part.id?{id:part.id}:{})});text=token;}
   }
  }
  if(text||chapterPage===0)emit();
 }
 return pages;
}
