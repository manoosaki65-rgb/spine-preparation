import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {MASTER_ID,readZip,zipText,replaceZipEntry,bridgePatchParts} from './src/master-writeback.js';
const bytes=new Uint8Array(await fs.readFile('.local/master-before.xlsx'));
const zip=readZip(bytes),entry=zip.entries.find(x=>x.name==='xl/worksheets/sheet5.xml');
const xml=await zipText(zip,entry.name),packaged=await replaceZipEntry(zip,entry.name,xml.replace('r="I56"','r="I56"'));
const parts=bridgePatchParts(packaged,zip);
let uploaded=[],calls=0;
const reply=(code,body,headers={})=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body),getAllHeaders:()=>headers,getBlob:()=>({getBytes:()=>Array.from(body)})});
const context={CONTRACT_FILE_ID:MASTER_ID,json_:x=>x,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-only-token'})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ScriptApp:{getOAuthToken:()=> 'test-only-oauth'},Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64'))},UrlFetchApp:{fetch(url,options){
 calls++;
 if(url.includes('uploadType=resumable')) {assert.equal(options.method,'patch');return reply(200,{}, {Location:'https://www.googleapis.com/test-session'});}
 if(url.endsWith('/test-session')) {uploaded.push(Buffer.from(options.payload));return uploaded.reduce((n,b)=>n+b.length,0)===packaged.length?reply(200,{id:MASTER_ID,version:'next'}):reply(308,{});}
 assert.ok(url.startsWith('https://www.googleapis.com/drive/v3/files/'+MASTER_ID));
 if(url.includes('alt=media')) {const match=options.headers.Range.match(/bytes=(\d+)-(\d+)/);return reply(206,bytes.subarray(Number(match[1]),Number(match[2])+1));}
 return reply(200,{id:MASTER_ID,name:'All - หลักประกันสัญญา 2570.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:bytes.length,version:'original'});
}}};
vm.createContext(context);vm.runInContext(await fs.readFile('drive-bridge/ZIPBridge.gs','utf8'),context);
const result=context.doPost({parameter:{token:'test-only-token'},postData:{contents:JSON.stringify({mode:'masterZipPatchV1',fileId:MASTER_ID,version:'original',parts,length:packaged.length})}});
assert.equal(result.ok,true);assert.equal(result.transport,'apps-script');assert.deepEqual(Buffer.concat(uploaded),Buffer.concat(packaged.chunks));
assert.equal(context.doPost({parameter:{token:'wrong'}}).ok,false);
console.log(JSON.stringify({bridgeReconstruction:true,uploadBytesPreserved:true,fileId:MASTER_ID,calls,credentialsExposed:false}));
