import {createApp} from './app.js';
process.umask(0o077);
const {server}=createApp({dbPath:process.env.DATABASE_PATH,production:process.env.NODE_ENV==='production',appOrigin:process.env.APP_ORIGIN});
const port=Number(process.env.PORT||3001);
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Lost Atlas server listening on port ${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
