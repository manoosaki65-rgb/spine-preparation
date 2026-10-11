import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {googleToken,MASTER_ID,readZip,zipText} from './src/master-writeback.js';
const phase=process.argv[3];
assert(['test','restored'].includes(phase));
const token=await googleToken({GOOGLE_SERVICE_ACCOUNT_JSON:await readFile(process.argv[2],'utf8')});
const response=await fetch('https://www.googleapis.com/drive/v3/files/'+MASTER_ID+'?alt=media',{headers:{Authorization:'Bearer '+token}});
assert(response.ok,'Master download failed');
const bytes=new Uint8Array(await response.arrayBuffer());
await writeFile('.local/master-'+phase+'.xlsx',bytes);
const before=readZip(new Uint8Array(await readFile('.local/master-before.xlsx'))), after=readZip(bytes);
const expected=JSON.parse(await readFile('.local/master-plan.json','utf8'));
const path=expected.path, cell='I'+expected.row;
const oldXML=await zipText(before,path), newXML=await zipText(after,path);
const cellPattern=new RegExp('<c\\b[^>]*\\br="'+cell+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
const oldCell=oldXML.match(cellPattern)?.[0], newCell=newXML.match(cellPattern)?.[0];
assert(oldCell && newCell);
assert.equal(newXML.replace(newCell,oldCell),oldXML,'Other worksheet content changed');
const hash=x=>createHash('sha256').update(x).digest('hex');let preserved=0;
assert.equal(before.entries.length,after.entries.length);
for(const entry of before.entries) {
  if(entry.name===path)continue;
  const current=after.entries.find(e=>e.name===entry.name);assert(current);
  assert.equal(hash(before.bytes.subarray(entry.dataOffset,entry.dataOffset+entry.compressed)),hash(after.bytes.subarray(current.dataOffset,current.dataOffset+current.compressed)),entry.name+' changed');preserved++;
}
const baseline=JSON.parse(await readFile('.local/site-records-before.json','utf8')).items;
const siteResponse=await fetch('https://spine-preparation.manoosaki65.workers.dev/api/spine-records');assert(siteResponse.ok);
const current=(await siteResponse.json()).items;
assert.equal(current.length,baseline.length);
let unchanged=0;
for(const record of baseline) {
 const observed=current.find(r=>r.sequence===record.sequence);assert(observed);
 if(record.sequence!=='69-298'){assert.deepEqual(observed,record);unchanged++;}
 else {const wanted=phase==='test'?record.item+' [WRITEBACK-TEST]':record.item;assert.equal(observed.item,wanted);assert(newCell.includes(wanted));assert.deepEqual({...observed,item:record.item,updatedAt:record.updatedAt},record);if(phase==='restored')assert.deepEqual(observed,record);}
}
const result={phase,masterFileId:MASTER_ID,sequence:'69-298',masterCell:cell,masterSheet:expected.sheet,webAndMasterMatch:true,otherZipEntriesPreserved:preserved,otherWorksheetContentPreserved:true,siteRecordCount:current.length,otherSiteRecordsPreserved:unchanged};
await writeFile('.local/verification-'+phase+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
