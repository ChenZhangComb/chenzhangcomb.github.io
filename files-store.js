(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AcademicFiles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const id=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'f-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function segment(value){const name=String(value||'').trim().normalize('NFC');if(!name||name.length>120||/[\u0000-\u001f\u007f/\\<>:"|?*]/u.test(name)||name==='.'||name==='..'||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('名称不能为空，也不能包含斜杠或系统保留字符；最长 120 个字符。');return name;}
  function path(value){if(value==='')return '';if(typeof value!=='string'||value.length>240)throw Error('文件路径过长或格式不正确。');return value.split('/').map(segment).join('/');}
  const href=relative=>'./assets/uploads/'+path(relative).split('/').map(encodeURIComponent).join('/');
  const folderOf=relative=>relative.includes('/')?relative.slice(0,relative.lastIndexOf('/')):'';
  function normalizeManifest(raw){
    if(!raw||raw.version!==1||!Array.isArray(raw.folders)||!Array.isArray(raw.files))throw Error('文件目录格式不正确。');
    const folders=new Set(['']);for(const value of raw.folders){const p=path(value);if(p.split('/').length>8)throw Error('文件夹层级最多 8 层。');folders.add(p);}
    const seen=new Set(),ids=new Set();
    const files=raw.files.map(file=>{
      const p=path(file.path);if(!p||seen.has(p.toLowerCase())||!validId(file.id)||ids.has(file.id))throw Error('文件目录存在重复或无效条目。');
      if(!Number.isSafeInteger(file.size)||file.size<0)throw Error('文件大小记录无效。');
      if(file.dataFile!==`file-data/${file.id}.js`)throw Error('文件内容索引不正确。');
      seen.add(p.toLowerCase());ids.add(file.id);
      return {id:file.id,path:p,name:p.split('/').pop(),size:file.size,type:typeof file.type==='string'?file.type:'',dataFile:file.dataFile};
    });
    for(const p of [...folders,...files.map(file=>folderOf(file.path))]){let current=p;while(current){folders.add(current);current=folderOf(current);}}
    for(const folder of folders)if(seen.has(folder.toLowerCase()))throw Error('文件和文件夹名称冲突。');
    return {version:1,folders:[...folders],files};
  }
  function uniquePath(folder,name,files,folders){
    name=segment(name);const occupied=new Set([...files.map(f=>f.path),...folders].map(p=>p.toLowerCase()));const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
    let candidate=folder?folder+'/'+name:name,index=2;
    while(occupied.has(candidate.toLowerCase())){candidate=(folder?folder+'/':'')+base+' ('+(index++)+')'+ext;}
    return path(candidate);
  }
  class Store{
    constructor({scope,manifest={version:1,folders:[''],files:[]},indexedDB=globalThis.indexedDB,onWarning=()=>{}}){this.scope=scope;this.manifest=normalizeManifest(manifest);this.idb=indexedDB;this.onWarning=onWarning;this.folders=[''];this.files=[];this.db=null;this.durable=false;this.urls=new Map();}
    async init(){
      try{
        if(!this.idb)throw Error('Storage unavailable');
        this.db=await new Promise((resolve,reject)=>{const req=this.idb.open('academic-file-library-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('libraries');req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});
        const saved=await new Promise((resolve,reject)=>{const tx=this.db.transaction('libraries'),req=tx.objectStore('libraries').get(this.scope);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        if(saved){const clean=normalizeManifest({version:1,folders:saved.folders,files:saved.files.map(file=>({...file,dataFile:`file-data/${file.id}.js`}))});this.folders=clean.folders;this.files=clean.files.map(file=>({...file,blob:saved.files.find(row=>row.id===file.id)?.blob}));if(this.files.some(file=>!(file.blob instanceof Blob)||file.blob.size!==file.size))throw Error('Saved attachment data invalid');}
        else{this.folders=[...this.manifest.folders];this.files=this.manifest.files.map(file=>({...file}));}
        this.durable=true;
      }catch{this.durable=false;this.folders=[...this.manifest.folders];this.files=this.manifest.files.map(file=>({...file}));this.onWarning('此浏览器无法持久保存附件，请在关闭页面前下载完整网站包。');}
      return this;
    }
    async persist(){
      if(!this.durable)return;
      try{
        const files=await Promise.all(this.files.map(async file=>({...file,blob:await this.blob(file.id)})));
        await new Promise((resolve,reject)=>{const tx=this.db.transaction('libraries','readwrite');tx.objectStore('libraries').put({folders:this.folders,files},this.scope);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      }catch(error){this.durable=false;console.warn('Attachment persistence failed:',error?.name,error?.message);this.onWarning(error?.name==='QuotaExceededError'?'浏览器存储空间不足，新增附件仅保留在本次编辑中。请在关闭页面前下载保存。':'附件已保留在本次编辑中，但浏览器保存失败。请及时下载完整网站包。');}
    }
    async blob(fileId){
      const file=this.files.find(f=>f.id===fileId);if(!file)throw Error('找不到此文件。');if(file.blob instanceof Blob)return file.blob;
      const data=await loadPacked(file.id,file.dataFile);
      const bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0));if(bytes.byteLength!==file.size)throw Error('附件内容不完整，请重新上传：'+file.name);
      file.blob=new Blob([bytes],{type:file.type||'application/octet-stream'});return file.blob;
    }
    async url(fileId){if(!this.urls.has(fileId))this.urls.set(fileId,URL.createObjectURL(await this.blob(fileId)));return this.urls.get(fileId);}
    async addFolder(parent,name){
      if(!this.folders.includes(parent))throw Error('目标文件夹不存在。');
      const p=path((parent?parent+'/':'')+segment(name));if(p.split('/').length>8)throw Error('文件夹层级最多 8 层。');
      if([...this.folders,...this.files.map(f=>f.path)].some(value=>value.toLowerCase()===p.toLowerCase()))throw Error('这里已有同名文件或文件夹。');
      this.folders.push(p);await this.persist();return p;
    }
    async upload(folder,incoming){
      if(!this.folders.includes(folder))throw Error('目标文件夹不存在。');
      const files=Array.from(incoming);
      const proposed=[];
      for(const file of files){
        if(!(file instanceof Blob)||typeof file.name!=='string')throw Error('请选择有效文件。');
        const p=uniquePath(folder,file.name,[...this.files,...proposed],this.folders),fileId=id(),type=file.type||'application/octet-stream';
        // Copy the bytes so storage does not depend on the original file remaining on disk.
        const blob=new Blob([await file.arrayBuffer()],{type});
        proposed.push({id:fileId,path:p,name:p.split('/').pop(),size:blob.size,type,dataFile:`file-data/${fileId}.js`,blob});
      }
      this.files.push(...proposed);await this.persist();return proposed;
    }
    async remove(fileId){const u=this.urls.get(fileId);if(u)URL.revokeObjectURL(u);this.urls.delete(fileId);this.files=this.files.filter(file=>file.id!==fileId);await this.persist();}
    async removeFolder(folder){if(!folder)throw Error('不能删除文件库根目录。');if(this.files.some(f=>f.path.startsWith(folder+'/'))||this.folders.some(f=>f!==folder&&f.startsWith(folder+'/')))throw Error('请先清空文件夹中的文件和子文件夹。');this.folders=this.folders.filter(p=>p!==folder);await this.persist();}
    manifestData(){return {version:1,folders:[...this.folders],files:this.files.map(({id,path,name,size,type,dataFile})=>({id,path,name,size,type,dataFile}))};}
  }
  async function loadPacked(fileId,dataFile){
    if(!validId(fileId)||dataFile!==`file-data/${fileId}.js`)throw Error('附件索引无效。');
    globalThis.ACADEMIC_PACKED_FILES=globalThis.ACADEMIC_PACKED_FILES||{};
    if(typeof globalThis.ACADEMIC_PACKED_FILES[fileId]==='string')return globalThis.ACADEMIC_PACKED_FILES[fileId];
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./'+dataFile;script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(Error('无法读取附件：请保留完整网站文件夹，或重新上传该文件。'));};document.head.append(script);});
    const value=globalThis.ACADEMIC_PACKED_FILES[fileId];if(typeof value!=='string')throw Error('附件数据缺失。');return value;
  }
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function checkZipLayout(entries){
    const encoder=new TextEncoder();let total=22;
    if(entries.length>=0xffff)throw Error('网站包条目数超出当前 ZIP 格式范围。请将部分附件改为外部下载链接后再打包。');
    for(const entry of entries){const nameLength=encoder.encode(entry.name).length;total+=76+nameLength*2+entry.size;
      if(nameLength>0xffff||!Number.isSafeInteger(entry.size)||entry.size<0||total>=0xffffffff)throw Error('网站包超出当前 ZIP 格式可导出的范围（小于 4 GiB，包含附件恢复数据）。文件库仍保留原文件，可逐个下载，或改用外部数据链接后再打包。');
    }
  }
  async function zip(entries){
    checkZipLayout(entries.map(entry=>({name:entry.name,size:(entry.data instanceof Blob?entry.data:new Blob([entry.data])).size})));
    const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
    for(const entry of entries){
      const filename=encoder.encode(entry.name),blob=entry.data instanceof Blob?entry.data:new Blob([entry.data]);
      const checksum=crc32(new Uint8Array(await blob.arrayBuffer()));const header=new Uint8Array(30),h=new DataView(header.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,checksum,true);h.setUint32(18,blob.size,true);h.setUint32(22,blob.size,true);h.setUint16(26,filename.length,true);
      parts.push(header,filename,blob);
      const directory=new Uint8Array(46),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,checksum,true);d.setUint32(20,blob.size,true);d.setUint32(24,blob.size,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);central.push(directory,filename);offset+=header.length+filename.length+blob.size;
    }
    const length=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  async function base64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
  async function exportSite({store,profile,sources,onProgress=()=>{}}){
    if(!sources||!sources['index.html'])throw Error('网站打包资源缺失，请使用完整的新版本网站文件夹。');
    const available=new Set([...Object.keys(sources),...store.files.map(file=>'assets/uploads/'+file.path)]);
    const references=[profile.avatar,profile.cv];
    for(const lang of ['zh','en']){
      for(const paper of profile[lang]?.publications||[])references.push(paper.url,paper.code,paper.data,...(paper.attachments||[]).map(item=>item.url));
      for(const project of profile[lang]?.projects||[])references.push(project.url);
    }
    for(const value of references){
      if(!value||/^https?:\/\//i.test(value))continue;
      let relative;try{relative=decodeURIComponent(new URL(value,'https://academic.invalid/').pathname.slice(1));}catch{throw Error('本地文件链接格式不正确：'+value);}
      if(!available.has(relative))throw Error('完整网站包缺少文件：'+value+'。请先将文件上传到文件库，并使用文件库显示的网站路径更新链接。');
    }
    const entries=Object.entries(sources).map(([name,data])=>({name,data}));
    entries.push({name:'site-source.js',data:'window.SITE_SOURCE = '+JSON.stringify(sources).replace(/</g,'\\u003c')+';\n'});
    entries.push({name:'profile.js',data:'window.PROFILE = '+JSON.stringify(profile,null,2).replace(/</g,'\\u003c')+';\n'});
    entries.push({name:'files.js',data:'window.SITE_FILES = '+JSON.stringify(store.manifestData(),null,2).replace(/</g,'\\u003c')+';\n'});
    for(const folder of store.folders){const name='assets/uploads/'+(folder?folder+'/':'')+'.gitkeep';if(!available.has(name))entries.push({name,data:''});}
    const packedPrefix=file=>'window.ACADEMIC_PACKED_FILES = window.ACADEMIC_PACKED_FILES || {};\nwindow.ACADEMIC_PACKED_FILES['+JSON.stringify(file.id)+'] = "';
    // Check format limits before reading large attachments into export buffers.
    checkZipLayout([...entries.map(entry=>({name:entry.name,size:new Blob([entry.data]).size})),...store.files.flatMap(file=>[{name:'assets/uploads/'+file.path,size:file.size},{name:file.dataFile,size:new Blob([packedPrefix(file)+'";\n']).size+4*Math.ceil(file.size/3)}])]);
    let index=0;
    for(const file of store.files){onProgress(`正在打包附件 ${++index}/${store.files.length}…`);const blob=await store.blob(file.id);entries.push({name:'assets/uploads/'+file.path,data:blob});entries.push({name:file.dataFile,data:'window.ACADEMIC_PACKED_FILES = window.ACADEMIC_PACKED_FILES || {};\nwindow.ACADEMIC_PACKED_FILES['+JSON.stringify(file.id)+'] = '+JSON.stringify(await base64(blob))+';\n'});}
    return zip(entries);
  }
  return {Store,segment,path,href,folderOf,normalizeManifest,zip,exportSite};
});
