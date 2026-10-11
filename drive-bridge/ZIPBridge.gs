// Bounded ZIP patches to the original Master. No conversion, copies or backup writes.
function doGet() {
  return json_({ok:true,service:'uttaradit-spine-drive-bridge',writer:'masterZipPatchV1',fileId:CONTRACT_FILE_ID});
}
function doPost(e) {
  const expected=PropertiesService.getScriptProperties().getProperty('BRIDGE_TOKEN')||'';
  if(!expected || String(e&&e.parameter&&e.parameter.token||'')!==expected) return json_({ok:false,error:'unauthorized'});
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return json_({ok:false,error:'master-busy'});
  try {
    const plan=JSON.parse(e.postData.contents||'{}');
    if(plan.mode!=='masterZipPatchV1' || plan.fileId!==CONTRACT_FILE_ID || !Array.isArray(plan.parts) || plan.parts.length>200) throw Error('invalid-patch-plan');
    const auth={Authorization:'Bearer '+ScriptApp.getOAuthToken()};
    const base='https://www.googleapis.com/drive/v3/files/'+CONTRACT_FILE_ID;
    const meta=JSON.parse(bridgeFetch_(base+'?fields=id,name,mimeType,size,version',{headers:auth}).getContentText());
    if(meta.name!=='All - หลักประกันสัญญา 2570.xlsx' || meta.mimeType!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || String(meta.version)!==String(plan.version)) throw Error('master-version-or-file-mismatch');
    let total=0;
    plan.parts.forEach(function(p){
      if(p.data!==undefined){p.bytes=Utilities.base64Decode(p.data);if(p.bytes.length>2*1024*1024) throw Error('patch-too-large');total+=p.bytes.length;}
      else {if(!Number.isInteger(p.offset)||!Number.isInteger(p.length)||p.offset<0||p.length<1||p.offset+p.length>Number(meta.size)) throw Error('invalid-source-range');total+=p.length;}
    });
    if(total!==plan.length || total>60*1024*1024 || total<1000) throw Error('invalid-output-length');
    const start=bridgeFetch_('https://www.googleapis.com/upload/drive/v3/files/'+CONTRACT_FILE_ID+'?uploadType=resumable&fields=id,version',{
      method:'patch',headers:Object.assign({},auth,{'X-Upload-Content-Type':meta.mimeType,'X-Upload-Content-Length':String(total)}),contentType:'application/json',payload:'{}'
    });
    const allHeaders=start.getAllHeaders();const location=allHeaders.Location||allHeaders.location;
    if(!location || !/^https:\/\/www.googleapis.com\//.test(location)) throw Error('invalid-upload-session');
    let partIndex=0,partOffset=0,outputOffset=0,result;
    const chunkSize=2*1024*1024;
    while(outputOffset<total){
      const needed=Math.min(chunkSize,total-outputOffset);const output=new Array(needed);let written=0;
      while(written<needed){
        const p=plan.parts[partIndex],size=p.bytes?p.bytes.length:p.length;
        const count=Math.min(needed-written,size-partOffset);let source;
        if(p.bytes) source=p.bytes.slice(partOffset,partOffset+count);
        else {
          const range=UrlFetchApp.fetch(base+'?alt=media',{headers:Object.assign({},auth,{Range:'bytes='+(p.offset+partOffset)+'-'+(p.offset+partOffset+count-1)}),muteHttpExceptions:true});
          if(range.getResponseCode()!==206) throw Error('source-range-read-failed');source=range.getBlob().getBytes();
        }
        if(source.length!==count) throw Error('source-range-length-mismatch');
        for(let i=0;i<count;i++) output[written+i]=source[i];written+=count;partOffset+=count;
        if(partOffset===size){partIndex++;partOffset=0;}
      }
      if(outputOffset+needed===total){
        const latest=JSON.parse(bridgeFetch_(base+'?fields=version',{headers:auth}).getContentText());
        if(String(latest.version)!==String(plan.version)) throw Error('master-changed-during-upload');
      }
      const upload=UrlFetchApp.fetch(location,{method:'put',headers:Object.assign({},auth,{'Content-Range':'bytes '+outputOffset+'-'+(outputOffset+needed-1)+'/'+total}),contentType:meta.mimeType,payload:output,muteHttpExceptions:true});
      const code=upload.getResponseCode();
      if(outputOffset+needed<total){if(code!==308) throw Error('upload-chunk-rejected-'+code);}
      else {if(code<200||code>=300) throw Error('upload-final-rejected-'+code);result=JSON.parse(upload.getContentText());}
      outputOffset+=needed;
    }
    if(result.id!==CONTRACT_FILE_ID) throw Error('uploaded-file-mismatch');
    return json_({ok:true,fileId:result.id,version:result.version,transport:'apps-script',writer:'masterZipPatchV1'});
  } catch(error){return json_({ok:false,error:String(error.message||'bridge-failed')});}
  finally {lock.releaseLock();}
}
function bridgeFetch_(url,options){
  options.muteHttpExceptions=true;const response=UrlFetchApp.fetch(url,options),code=response.getResponseCode();
  if(code<200||code>=300) throw Error('drive-request-failed-'+code);return response;
}
