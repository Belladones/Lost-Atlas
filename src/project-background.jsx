import React,{useEffect,useState} from 'react';
import {api} from './account';
import {DEFAULT_BACKGROUND} from '../shared/theme';
export function ProjectBackground({project,ready,unavailable}){
 const [theme,setTheme]=useState({key:null,color:DEFAULT_BACKGROUND});
 const key=project.id+':'+(project.coverImage||'');
 useEffect(()=>{
  if(!project.id||!project.coverImage||!ready||theme.key===key)return;
  let active=true;
  api('/api/project-theme?projectId='+encodeURIComponent(project.id)).then(({color})=>{if(active)setTheme({key,color});}).catch(()=>{if(active)setTheme({key,color:DEFAULT_BACKGROUND});});
  return()=>{active=false;};
 },[project.id,project.coverImage,ready]);
 const color=!unavailable&&project.coverImage&&theme.key===key?theme.color:DEFAULT_BACKGROUND;
 return <div className="project-background" style={{backgroundColor:color}} aria-hidden="true"/>;
}
