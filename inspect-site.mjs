import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('.local',{recursive:true});
const origin='https://spine-preparation.manoosaki65.workers.dev';
for(const path of ['/api/health','/spine/app.js','/spine/folders.js','/spine/documents.js']) {
  const response=await fetch(origin+path);if(!response.ok)throw new Error('Site read failed: '+response.status);
  const text=await response.text();await writeFile('.local/'+path.split('/').at(-1),text);
  console.log(JSON.stringify({path,status:response.status,bytes:text.length}));
}
