import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Verify that Neon env pulls cannot be shadowed by stale local configuration,
// and that hosting platforms retain priority over local files.
test('variables du processus > .env.local > .env, fichiers facultatifs',t=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-env-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const env={...process.env};delete env.ATLAS_ENV_PROBE;
 const code=`import ${JSON.stringify(new URL('../scripts/env.js',import.meta.url).href)};console.log(process.env.ATLAS_ENV_PROBE||'absent');`;
 const run=extra=>execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:dir,env:{...env,...extra},encoding:'utf8'}).trim();
 assert.equal(run(),'absent');
 writeFileSync(join(dir,'.env'),'ATLAS_ENV_PROBE=base\n');assert.equal(run(),'base');
 writeFileSync(join(dir,'.env.local'),'ATLAS_ENV_PROBE=neon-local\n');assert.equal(run(),'neon-local');
 assert.equal(run({ATLAS_ENV_PROBE:'hosting-platform'}),'hosting-platform');
});
