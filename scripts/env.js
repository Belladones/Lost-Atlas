// Process variables win, then .env.local, then .env (matching Vite's precedence).
for(const file of ['.env.local','.env']){
 try{process.loadEnvFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
}
