// Updates the original XLSX in place. Untouched ZIP entries are copied as bytes.
export const MASTER_ID = '1j3c-5P4CMd0kktcA-aGqZWb-XZHY3cO8';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const error = (code, status = 502) => { throw Object.assign(new Error(code), {status}); };
const xmlDecode = s => s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_,hex,dec,name) => hex ? String.fromCodePoint(parseInt(hex,16)) : dec ? String.fromCodePoint(Number(dec)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name]);
const xmlEncode = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
const attr = (text, name) => xmlDecode(text.match(new RegExp('(?:^|\\s)'+name+'="([^"]*)"'))?.[1] || '');
const normalize = s => String(s || '').trim().replace(/\s+/g,' ');
const year = s => { const n = Number(normalize(s)); return n < 100 ? n + 2500 : n; };
const columns = {contractNo:'E',slash:'F',fiscalYear:'G',contractDate:'H',item:'I',planBudget:'J',procurementAmount:'K',contractor:'L',guaranteeType:'M',guaranteeBranch:'N',guaranteeNo:'O',guaranteeDate:'P',guaranteeAmount:'Q',deliveryDue:'R',deliveryActual:'S',acceptanceDate:'T',warrantyPeriod:'U',warrantyDay:'V',warrantyMonth:'W',warrantyYear:'X',guaranteeReturnDate:'Y',procurementOfficer:'Z',department:'AA',fundSource:'AB'};
const numericFields = new Set(['planBudget','procurementAmount','guaranteeAmount','contractNo','fiscalYear','warrantyDay','warrantyYear']);
const crcTable = Uint32Array.from({length:256}, (_,n) => { for(let i=0;i<8;i++) n=(n&1)?0xedb88320^(n>>>1):n>>>1; return n>>>0; });
function crc32(bytes) { let n=0xffffffff; for(const b of bytes) n=crcTable[(n^b)&255]^(n>>>8); return (n^0xffffffff)>>>0; }

export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while(end >= Math.max(0,bytes.length-65557) && view.getUint32(end,true)!==0x06054b50) end--;
  if(end<0 || view.getUint32(end,true)!==0x06054b50) error('master-invalid-zip');
  const count=view.getUint16(end+10,true), centralOffset=view.getUint32(end+16,true);
  if(count===65535 || centralOffset===0xffffffff || view.getUint16(end+4,true)!==0) error('master-unsupported-zip');
  const entries=[];
  let pos=centralOffset;
  for(let i=0;i<count;i++) {
    if(view.getUint32(pos,true)!==0x02014b50) error('master-invalid-central-directory');
    const nameLength=view.getUint16(pos+28,true), extraLength=view.getUint16(pos+30,true), commentLength=view.getUint16(pos+32,true);
    const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));
    const offset=view.getUint32(pos+42,true), compressed=view.getUint32(pos+20,true), size=view.getUint32(pos+24,true), method=view.getUint16(pos+10,true);
    if(view.getUint16(pos+8,true)&1 || size===0xffffffff || compressed===0xffffffff || offset===0xffffffff) error('master-unsupported-zip');
    if(view.getUint32(offset,true)!==0x04034b50) error('master-invalid-local-header');
    const dataOffset=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
    const length=46+nameLength+extraLength+commentLength;
    entries.push({name,offset,dataOffset,compressed,size,method,central:bytes.slice(pos,pos+length)});
    pos+=length;
  }
  return {bytes,entries,end:bytes.slice(end),centralOffset};
}
export async function zipText(zip,name) {
  const entry=zip.entries.find(e=>e.name===name);
  if(!entry || entry.size>25*1024*1024) error('master-xml-missing-or-too-large');
  const data=zip.bytes.subarray(entry.dataOffset,entry.dataOffset+entry.compressed);
  if(entry.method===0) return decoder.decode(data);
  if(entry.method!==8) error('master-unsupported-compression');
  const plain=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  if(plain.byteLength!==entry.size) error('master-corrupt-entry');
  return decoder.decode(plain);
}
export async function replaceZipEntry(zip,name,text) {
  const old=zip.entries.find(e=>e.name===name);
  if(!old) error('master-sheet-missing');
  const plain=encoder.encode(text);
  const packed=new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const header=zip.bytes.slice(old.offset,old.dataOffset), h=new DataView(header.buffer);
  h.setUint16(6,h.getUint16(6,true)&~8,true); h.setUint16(8,8,true);
  h.setUint32(14,crc32(plain),true); h.setUint32(18,packed.length,true); h.setUint32(22,plain.length,true);
  const chunks=[], offsets=new Map(); let offset=0;
  const sorted=[...zip.entries].sort((a,b)=>a.offset-b.offset);
  if(sorted[0]?.offset!==0) error('master-unsupported-zip-prefix');
  for(let i=0;i<sorted.length;i++) {
    const entry=sorted[i]; offsets.set(entry.name,offset);
    const parts=entry.name===name ? [header,packed] : [zip.bytes.subarray(entry.offset,sorted[i+1]?.offset ?? zip.centralOffset)];
    for(const p of parts) {chunks.push(p);offset+=p.length;}
  }
  const centralStart=offset;
  for(const entry of zip.entries) {
    const c=entry.central.slice(), v=new DataView(c.buffer);
    v.setUint32(42,offsets.get(entry.name),true);
    if(entry.name===name) {
      v.setUint16(8,v.getUint16(8,true)&~8,true);v.setUint16(10,8,true);
      v.setUint32(16,crc32(plain),true);v.setUint32(20,packed.length,true);v.setUint32(24,plain.length,true);
    }
    chunks.push(c); offset+=c.length;
  }
  const end=zip.end.slice(), e=new DataView(end.buffer);
  e.setUint32(12,offset-centralStart,true);e.setUint32(16,centralStart,true);
  chunks.push(end);offset+=end.length;
  return {chunks,length:offset,changedOffset:old.offset,changedParts:[header,packed]};
}
function strings(xml) { return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlDecode(t[1])).join('')); }
function cells(row, shared) {
  const result={};
  for(const m of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref=attr(m[1],'r'), inner=m[2]||'', value=inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]||'';
    const text=attr(m[1],'t')==='s' ? shared[Number(value)]||'' : attr(m[1],'t')==='inlineStr' ? [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlDecode(t[1])).join('') : xmlDecode(value);
    result[ref.replace(/\d+$/,'')]={xml:m[0],text,formula:/<f\b/.test(inner)};
  }
  return result;
}
export async function planMaster(zip,data,previous) {
  const workbook=await zipText(zip,'xl/workbook.xml'), rels=await zipText(zip,'xl/_rels/workbook.xml.rels');
  const shared=strings(await zipText(zip,'xl/sharedStrings.xml'));
  const sheets=[...workbook.matchAll(/<sheet\b([^>]*?)\/>/g)].map(m=>({name:attr(m[1],'name'),id:attr(m[1],'r:id')}));
  const relationships=new Map([...rels.matchAll(/<Relationship\b([^>]*?)\/>/g)].map(m=>[attr(m[1],'Id'),attr(m[1],'Target')]));
  const desiredYear=year(previous?.fiscalYear || data.fiscalYear), suffix=String(desiredYear).slice(-2);
  const candidates=sheets.filter(s=>s.name.trim()===suffix || s.name.trim().startsWith(suffix+' '));
  if(!candidates.length) error('master-fiscal-year-sheet-missing',409);
  const loaded=[];let matches=[];
  for(const sheet of candidates) {
    const target=relationships.get(sheet.id);if(!target || target.includes('..')) error('master-invalid-sheet-relationship');
    const path=target.startsWith('/')?target.slice(1):'xl/'+target;
    const xml=await zipText(zip,path);
    const rows=[...xml.matchAll(/<row\b([^>]*?)>([\s\S]*?)<\/row>/g)].map(m=>({xml:m[0],number:Number(attr(m[1],'r')),cells:cells(m[2],shared)}));
    const record={sheet:sheet.name,path,xml,rows};loaded.push(record);
    for(const row of rows) if(row.number>=10 && normalize(row.cells.E?.text).replace(/^0+(?=\d)/,'')===normalize(previous?.contractNo || data.contractNo).replace(/^0+(?=\d)/,'') && year(row.cells.G?.text)===desiredYear) matches.push({...record,row});
  }
  if(matches.length>1) {
    const exactItem=matches.filter(m=>normalize(m.row.cells.I?.text)===normalize(previous?.item || data.item));
    if(exactItem.length) matches=exactItem;
    else {
      const vendor=normalize(previous?.contractor || data.contractor);
      const exactVendor=vendor?matches.filter(m=>normalize(m.row.cells.L?.text)===vendor):[];
      if(exactVendor.length) matches=exactVendor;
    }
  }
  if(matches.length>1) error('master-ambiguous-contract',409);
  let selected=matches[0], inserted=false;
  if(!selected) {
    if(previous) error('master-existing-contract-not-found',409);
    const target=loaded.find(s=>s.sheet.trim()===suffix) || loaded[0];
    // Reuse a formatted empty row after the last contract; never overwrite a reserved contract.
    const last=Math.max(10,...target.rows.filter(r=>normalize(r.cells.E?.text)).map(r=>r.number));
    const blank=target.rows.find(r=>r.number>last && !Object.values(r.cells).some(c=>normalize(c.text)||c.formula));
    if(!blank) error('master-no-safe-empty-row',409);
    selected={...target,row:blank}; inserted=true;
  }
  let rowXml=selected.row.xml;const changed=[];
  for(const [field,column] of Object.entries(columns)) {
    if(previous ? String(data[field]||'')===String(previous[field]||'') : !data[field]) continue;
    const value=String(data[field]||''), cell=selected.row.cells[column], ref=column+selected.row.number;
    if(cell?.formula) error('master-formula-cell-protected',409);
    const attrs=cell?.xml.match(/^<c\b([^>]*?)(?:\/>|>)/)?.[1]?.replace(/\s+t="[^"]*"/g,'') || ' r="'+ref+'"';
    const numericValue=value.replace(/,/g,'').replace(/\s*บาท\s*$/,'').trim();
    const numeric=numericFields.has(field) && /^-?\d+(?:\.\d+)?$/.test(numericValue);
    const next=value==='' ? '<c'+attrs+'/>' : numeric ? '<c'+attrs+'><v>'+numericValue+'</v></c>' : '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xmlEncode(value)+'</t></is></c>';
    if(cell) rowXml=rowXml.replace(cell.xml,next);
    else {
      const rank=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
      const following=[...rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)].find(m=>rank(m[1])>rank(column));
      rowXml=following ? rowXml.slice(0,following.index)+next+rowXml.slice(following.index) : rowXml.replace('</row>',next+'</row>');
    }
    changed.push({field,cell:ref,value});
  }
  if(inserted) {
    const ref='D'+selected.row.number, cell=selected.row.cells.D;
    const next='<c r="'+ref+'" t="inlineStr"><is><t>'+xmlEncode(data.sequence)+'</t></is></c>';
    rowXml=cell ? rowXml.replace(cell.xml,next) : rowXml.replace(/(<row\b[^>]*>)/,'$1'+next);
  }
  return {path:selected.path,sheet:selected.sheet,row:selected.row.number,inserted,changed,xml:selected.xml.replace(selected.row.xml,rowXml)};
}
function base64url(bytes) { let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function bridgePatchParts(packaged,zip) {
  const parts=[];
  for(const chunk of packaged.chunks) {
    if(chunk.buffer===zip.bytes.buffer) {
      const offset=chunk.byteOffset-zip.bytes.byteOffset,previous=parts.at(-1);
      if(previous?.offset!==undefined && previous.offset+previous.length===offset) previous.length+=chunk.length;
      else parts.push({offset,length:chunk.length});
    } else {
      const data=base64url(chunk).replace(/-/g,'+').replace(/_/g,'/');parts.push({data:data.padEnd(Math.ceil(data.length/4)*4,'=')});
    }
  }
  return parts;
}
let cachedToken;
export async function googleToken(env) {
  if(cachedToken && cachedToken.expires>Date.now()+60000) return cachedToken.value;
  let key;try{key=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);}catch{error('master-secret-not-configured',503);}
  if(key.type!=='service_account' || !key.client_email || !key.private_key) error('master-secret-invalid',503);
  const now=Math.floor(Date.now()/1000), encode=x=>base64url(encoder.encode(JSON.stringify(x)));
  const input=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const pem=key.private_key.replace(/-----[^-]+-----|\s/g,'');
  const signingKey=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,encoder.encode(input));
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+base64url(new Uint8Array(signature))}),signal:AbortSignal.timeout(20000)});
  if(!response.ok) error('master-authentication-failed');
  const result=await response.json();cachedToken={value:result.access_token,expires:Date.now()+result.expires_in*1000};return cachedToken.value;
}
async function metadata(headers) {
  const response=await fetch('https://www.googleapis.com/drive/v3/files/'+MASTER_ID+'?fields=id,mimeType,size,version,capabilities(canEdit)',{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok) error('master-access-denied');
  const result=await response.json();
  if(result.mimeType!==XLSX || !result.capabilities?.canEdit || Number(result.size)>60*1024*1024) error('master-file-invalid-or-readonly',409);
  return {...result,etag:response.headers.get('etag')};
}
export async function writeMaster(env,data,previous) {
  const headers={Authorization:'Bearer '+await googleToken(env)};
  const before=await metadata(headers);
  const response=await fetch('https://www.googleapis.com/drive/v3/files/'+MASTER_ID+'?alt=media',{headers,signal:AbortSignal.timeout(60000)});
  if(!response.ok) error('master-download-failed');
  const zip=readZip(new Uint8Array(await response.arrayBuffer()));
  const plan=await planMaster(zip,data,previous);
  if(!plan.changed.length && !plan.inserted) return {ok:true,fileId:MASTER_ID,sheet:plan.sheet,row:plan.row,changed:[],version:before.version};
  const packaged=await replaceZipEntry(zip,plan.path,plan.xml);
  const current=await metadata(headers);
  if(current.version!==before.version) error('master-changed-during-edit-please-retry',409);
  // Stream compressed entries; never inflate the remaining 330 MB workbook.
  let index=0,position=0;
  const body=new ReadableStream({pull(controller){
    if(index>=packaged.chunks.length){controller.close();return;}
    const chunk=packaged.chunks[index],end=Math.min(position+65536,chunk.length);
    controller.enqueue(chunk.subarray(position,end));position=end;
    if(position===chunk.length){index++;position=0;}
  }});
  let uploadBody=body;
  if(typeof FixedLengthStream!=='undefined' && env.MASTER_WRITEBACK_TRANSPORT!=='apps-script') {
    const fixed=new FixedLengthStream(packaged.length);body.pipeTo(fixed.writable).catch(()=>{});uploadBody=fixed.readable;
  }
  let saved;
  if(env.MASTER_WRITEBACK_TRANSPORT==='apps-script') {
    if(env.DRIVE_BRIDGE_ENABLED!=='true'||!env.DRIVE_BRIDGE_URL||!env.DRIVE_BRIDGE_TOKEN) error('master-bridge-not-configured',503);
    const target=new URL(env.DRIVE_BRIDGE_URL);if(target.protocol!=='https:'||target.hostname!=='script.google.com') error('invalid-bridge-url',503);
    target.searchParams.set('token',env.DRIVE_BRIDGE_TOKEN);
    const parts=bridgePatchParts(packaged,zip);
    const uploaded=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'masterZipPatchV1',fileId:MASTER_ID,version:before.version,length:packaged.length,parts}),redirect:'follow',signal:AbortSignal.timeout(290000)});
    try{saved=await uploaded.json();}catch{error('invalid-bridge-response');}
    if(!uploaded.ok||saved.ok!==true||saved.fileId!==MASTER_ID||saved.writer!=='masterZipPatchV1') {
      const safeCode=/^(unauthorized|master-busy|invalid-patch-plan|master-version-or-file-mismatch|patch-too-large|invalid-source-range|invalid-output-length|invalid-upload-session|source-range-read-failed|source-range-length-mismatch|master-changed-during-upload|uploaded-file-mismatch|drive-request-failed-\d{3}|upload-(chunk|final)-rejected-\d{3})$/.test(saved.error||'')?saved.error:'write-failed';
      error('master-bridge-'+safeCode);
    }
  } else {
    const uploaded=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+MASTER_ID+'?uploadType=media&fields=id,version',{method:'PATCH',headers:{...headers,'Content-Type':XLSX,'Content-Length':String(packaged.length),...(current.etag?{'If-Match':current.etag}:{})},body:uploadBody,duplex:'half',signal:AbortSignal.timeout(120000)});
    if(!uploaded.ok) error('master-upload-failed');saved=await uploaded.json();
  }
  // Confirm changed cells from Drive, rather than treating upload acceptance as verification.
  const expectedLength=packaged.changedParts.reduce((n,p)=>n+p.length,0);
  const check=await fetch('https://www.googleapis.com/drive/v3/files/'+MASTER_ID+'?alt=media',{headers:{...headers,Range:'bytes='+packaged.changedOffset+'-'+(packaged.changedOffset+expectedLength-1)},signal:AbortSignal.timeout(30000)});
  if(check.status!==206) {await check.body?.cancel();error('master-readback-range-failed');}
  const verified=new Uint8Array(await check.arrayBuffer());
  let verifiedOffset=0;
  if(verified.length!==expectedLength) error('master-readback-mismatch');
  for(const part of packaged.changedParts) for(const byte of part) if(verified[verifiedOffset++]!==byte) error('master-readback-mismatch');
  return {ok:true,fileId:MASTER_ID,sheet:plan.sheet,row:plan.row,inserted:plan.inserted,changed:plan.changed.map(c=>c.cell),version:saved.version,verified:true,transport:env.MASTER_WRITEBACK_TRANSPORT==='apps-script'?'apps-script':'service-account'};
}
