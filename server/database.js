import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';

export async function createDatabase({connectionString=process.env.DATABASE_URL,migrationConnectionString=connectionString,schema='public'}={}){
 if(!connectionString)throw new Error('DATABASE_URL est requis. Consultez .env.example et démarrez PostgreSQL.');
 if(!/^[a-z_][a-z0-9_]*$/.test(schema))throw new Error('Schéma PostgreSQL invalide.');
 // Normal Neon traffic uses PgBouncer; do not rely on startup session options.
 const options=schema==='public'?{}:{options:`-c search_path=${schema}`};
 const pool=new pg.Pool({connectionString,...options,max:10,connectionTimeoutMillis:10000});
 const migrationPool=migrationConnectionString===connectionString?pool:new pg.Pool({connectionString:migrationConnectionString,...options,max:1,connectionTimeoutMillis:10000});
 pool.on('error',()=>console.error('Connexion PostgreSQL interrompue.'));
 const context=new AsyncLocalStorage();
 const query=(sql,values)=> (context.getStore()||pool).query(sql,values);
 async function transaction(fn,source=pool){
  const client=await source.connect();
  try{await client.query('BEGIN');const result=await context.run(client,fn);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 try{
  await transaction(async()=>{
   // Serialize schema initialization across application processes.
   await query('SELECT pg_advisory_xact_lock(73412891)');
   await query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS libraries (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,body JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,hash TEXT NOT NULL,body BYTEA NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at BIGINT NOT NULL,UNIQUE(user_id,hash));
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS media_owner ON media(user_id);
    CREATE TABLE IF NOT EXISTS oauth_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS oauth_flows(state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL,browser_hash TEXT NOT NULL,verifier TEXT NOT NULL,nonce TEXT NOT NULL,expires_at BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS oauth_flows_expiry ON oauth_flows(expires_at);`);
  },migrationPool);
 }catch(error){await pool.end();throw error;}finally{if(migrationPool!==pool)await migrationPool.end();}
 let closing;
 return {query,transaction,close:()=>closing??=(pool.end())};
}
