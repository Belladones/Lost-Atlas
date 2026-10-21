import pg from 'pg';
import {randomBytes} from 'node:crypto';
export async function testDatabase(t){
 const databaseUrl=process.env.TEST_DATABASE_URL;
 if(!databaseUrl)throw new Error('TEST_DATABASE_URL est requis : utilisez une base PostgreSQL réservée aux tests.');
 const schema='atlas_test_'+randomBytes(12).toString('hex');
 const admin=new pg.Pool({connectionString:databaseUrl});
 await admin.query(`CREATE SCHEMA ${schema}`);
 t.after(async()=>{try{await admin.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await admin.end();}});
 return {databaseUrl,schema};
}
