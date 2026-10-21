import React,{useEffect,useState} from 'react';
import {api} from './account';
import {DEFAULT_BACKGROUND} from '../shared/theme';
import {browserCoverColor} from './cover-color';
export function useProjectColor({project,ready,unavailable,enabled=true}){
 const [theme,setTheme]=useState({key:null,color:DEFAULT_BACKGROUND});
 const key=project.id+':'+(project.coverImage||'');
 useEffect(()=>{
  if(!enabled||!project.id||!project.coverImage||!ready||unavailable||(theme.key===key&&!theme.failed))return;
  const controller=new AbortController();let timer;
  async function load(attempt=0){
   let result;
   try{result=await api('/api/project-theme?projectId='+encodeURIComponent(project.id),{signal:controller.signal});}catch{result={color:DEFAULT_BACKGROUND,unavailable:true};}
   if(controller.signal.aborted)return;
   if(result.unavailable){const color=await browserCoverColor(project.coverImage,controller.signal);if(color)result={color};}
   if(controller.signal.aborted)return;
   setTheme({key,color:result.color,failed:!!result.unavailable});
   if(result.unavailable&&attempt<2)timer=setTimeout(()=>load(attempt+1),(attempt+1)*1500);
  }
  load();return()=>{controller.abort();clearTimeout(timer);};
 },[project.id,project.coverImage,ready,unavailable,enabled]);
 const color=enabled&&!unavailable&&project.coverImage&&theme.key===key?theme.color:DEFAULT_BACKGROUND;
 return color;
}

export function ProjectBackground({color=DEFAULT_BACKGROUND}){return <div className="project-background" style={{backgroundColor:color}} aria-hidden="true"/>;}
