import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './database.js';
import {testDatabase} from './test-database.js';
import pg from 'pg';

test('initialise le schéma avec la connexion directe séparée du pool applicatif',async t=>{
 const {databaseUrl,schema}=await testDatabase(t);
 // The runtime address is intentionally unreachable: successful initialization
 // must use the separate direct URL rather than borrowing a runtime connection.
 const db=await createDatabase({connectionString:'postgresql://unused:unused@127.0.0.1:1/unused',migrationConnectionString:databaseUrl,schema});
 await db.close();
 const verification=new pg.Pool({connectionString:databaseUrl});t.after(()=>verification.end());
 const tables=(await verification.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1',[schema])).rows.map(row=>row.table_name).sort();
 assert.deepEqual(tables,['libraries','media','oauth_flows','oauth_identities','sessions','user_settings','users']);
});
