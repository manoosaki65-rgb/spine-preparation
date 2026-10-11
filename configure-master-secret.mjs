import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const key=await readFile(process.argv[2],'utf8');
const parsed=JSON.parse(key);
if(parsed.type!=='service_account' || !parsed.private_key || !parsed.client_email) throw new Error('Invalid service account file');
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','put','GOOGLE_SERVICE_ACCOUNT_JSON','--name','spine-preparation'],{stdio:['pipe','pipe','pipe'],env:{...process.env,WRANGLER_LOG:'error',WRANGLER_SEND_METRICS:'false'}});
// Never forward secret-bearing input or diagnostic output to chat.
child.stdout.resume();child.stderr.resume();child.stdin.end(key);
child.on('error',()=>{console.error('Secret configuration process failed.');process.exitCode=1;});
child.on('close',code=>{console.log(JSON.stringify({secret:'GOOGLE_SERVICE_ACCOUNT_JSON',worker:'spine-preparation',configured:code===0}));process.exitCode=code || 0;});
