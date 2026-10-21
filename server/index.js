import {createApp} from './app.js';
import '../scripts/env.js';
process.umask(0o077);
let app;
try{app=await createApp({production:process.env.NODE_ENV==='production',appOrigin:process.env.APP_ORIGIN});}
catch{console.error('Connexion PostgreSQL impossible. Vérifiez DATABASE_URL dans .env et démarrez la base de données.');process.exit(1);}
const {server,db}=app;
const port=Number(process.env.PORT||3001);
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Lost Atlas server listening on port ${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
