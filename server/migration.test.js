import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {migrateSqlite} from '../scripts/migrate-sqlite.js';
import {createDatabase} from './database.js';
import {testDatabase} from './test-database.js';
import {initial} from '../src/model.js';

test('migration atomique : comptes, hachages, sessions, JSON, révisions et octets des images conservés',async t=>{
 const options=await testDatabase(t);const dir=mkdtempSync(join(tmpdir(),'atlas-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const source=join(dir,'old.sqlite');
 const old=new DatabaseSync(source);old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,password_hash TEXT,created_at INTEGER);CREATE TABLE libraries(user_id TEXT,body TEXT,revision INTEGER,updated_at INTEGER);CREATE TABLE sessions(token_hash TEXT,user_id TEXT,expires_at INTEGER);CREATE TABLE media(id TEXT,user_id TEXT,hash TEXT,body BLOB,width INTEGER,height INTEGER,created_at INTEGER);`);
 const image='11111111-1111-4111-8111-111111111111',bytes=Buffer.from([0,255,128,1,2]);const data=structuredClone(initial);data.projects[0].coverImage=image;data.projects[0].relations[0].fromDescription='A aime B';data.projects[0].relations[0].toDescription='B ignore A';
 old.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-1','old@example.test','Ancien','salt:hash-preserved',1700000000000);
 old.prepare('INSERT INTO libraries VALUES (?,?,?,?)').run('user-1',JSON.stringify(data),12,1700000000001);
 old.prepare('INSERT INTO sessions VALUES (?,?,?)').run('token-hash','user-1',1900000000000);
 old.prepare('INSERT INTO media VALUES (?,?,?,?,?,?,?)').run(image,'user-1',createHash('sha256').update(bytes).digest('hex'),bytes,10,20,1700000000002);old.close();
 const before=readFileSync(source);const config={source,connectionString:options.databaseUrl,schema:options.schema};
 assert.deepEqual(await migrateSqlite({...config,dryRun:true}),{users:1,libraries:1,sessions:1,media:1});
 const db=await createDatabase({connectionString:options.databaseUrl,schema:options.schema});t.after(()=>db.close());assert.equal((await db.query('SELECT * FROM users')).rowCount,0);
 await migrateSqlite(config);
 assert.equal((await db.query('SELECT password_hash FROM users')).rows[0].password_hash,'salt:hash-preserved');
 const saved=(await db.query('SELECT * FROM libraries')).rows[0];assert.deepEqual(saved.body,data);assert.equal(saved.revision,12);
 assert.equal((await db.query('SELECT expires_at FROM sessions')).rows[0].expires_at,'1900000000000');assert.deepEqual((await db.query('SELECT body FROM media')).rows[0].body,bytes);
 await assert.rejects(migrateSqlite(config),/contient déjà/);assert.deepEqual(readFileSync(source),before);
 // A late duplicate-key failure must roll back all previously inserted rows.
 await db.query('TRUNCATE users CASCADE');const broken=new DatabaseSync(source);broken.prepare('INSERT INTO sessions VALUES (?,?,?)').run('token-hash','user-1',1900000000000);broken.close();
 await assert.rejects(migrateSqlite(config));assert.equal((await db.query('SELECT * FROM users')).rowCount,0);assert.equal((await db.query('SELECT * FROM libraries')).rowCount,0);
});
