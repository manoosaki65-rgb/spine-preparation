import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readZip,zipText,planMaster,replaceZipEntry} from './src/master-writeback.js';
const source=new Uint8Array(await readFile('.local/master-before.xlsx'));
const records=JSON.parse(await readFile('.local/site-records-before.json','utf8')).items;
const previous=records.find(r=>r.sequence==='69-298');
assert(previous);
const zip=readZip(source);
const desired={...previous,procurementOfficer:previous.procurementOfficer+' [WRITEBACK-TEST]'};
const plan=await planMaster(zip,desired,previous);
assert.equal(plan.changed.length,1);
assert.equal(plan.changed[0].field,'procurementOfficer');
const packed=await replaceZipEntry(zip,plan.path,plan.xml);
const bytes=Buffer.concat(packed.chunks);
const edited=readZip(bytes);
assert.equal(await zipText(edited,plan.path),plan.xml);
const hash=x=>createHash('sha256').update(x).digest('hex');
let preserved=0;
for(const e of zip.entries) {
  if(e.name===plan.path) continue;
  const other=edited.entries.find(x=>x.name===e.name);
  assert(other);
  assert.equal(hash(zip.bytes.subarray(e.dataOffset,e.dataOffset+e.compressed)),hash(edited.bytes.subarray(other.dataOffset,other.dataOffset+other.compressed)));
  preserved++;
}
const restore=await planMaster(edited,previous,desired);
assert.equal(restore.changed.length,1);
assert.equal(restore.changed[0].value,previous.procurementOfficer);
await assert.rejects(()=>planMaster(zip,{...previous,contractNo:'999999'}, {...previous,contractNo:'999999'}),/master-existing-contract-not-found/);
const noop=await planMaster(zip,previous,previous);assert.equal(noop.changed.length,0);
const mappingFailures=[];
for(const record of records) {
  try {await planMaster(zip,record,record);} catch(e) {mappingFailures.push({sequence:record.sequence,error:e.message});}
}
assert.deepEqual(mappingFailures,[],'Existing record mapping failed: '+JSON.stringify(mappingFailures));
const inserted=await planMaster(zip,{...previous,sequence:'69-999',contractNo:'999',item:'LOCAL PLAN ONLY'},null);
assert.equal(inserted.inserted,true);
await writeFile('.local/master-plan.json',JSON.stringify({sheet:plan.sheet,path:plan.path,row:plan.row,cell:plan.changed[0].cell}));
console.log(JSON.stringify({editPlan:{sheet:plan.sheet,row:plan.row,cell:plan.changed[0].cell},zipEntriesPreserved:preserved,untouchedCompressedBytesPreserved:true,noOp:true,restorePlan:true,newRecordPlan:true,existingRecordMappings:records.length}));
