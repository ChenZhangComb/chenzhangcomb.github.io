(() => {
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source=clone(window.PROFILE), key='academic-draft-v2:'+location.pathname;
  const kinds={research:'研究方向',publications:'论文',projects:'项目',education:'经历'};
  const fields={
    research:[['title','研究方向名称'],['description','说明','textarea']],
    publications:[['title','论文标题'],['authors','作者（按顺序填写）'],['venue','期刊 / 会议 / 预印本平台'],['year','年份'],['note','备注（可选）'],['url','论文链接','url'],['code','代码链接','url'],['data','数据下载链接（也可在下方上传文件）','url'],['bibtex','BibTeX 引用（可选）','textarea']],
    projects:[['title','项目名称'],['description','项目简介','textarea'],['tags','关键词（用逗号分隔）'],['url','项目链接','url']],
    education:[['period','起止时间'],['title','学位 / 职位'],['institution','学校 / 机构'],['description','补充说明（可选）','textarea']]
  };
  const localFields=['name','role','affiliation','location','intro','bio'];
  const sharedFields=['email','avatar','github','scholar','orcid','cv'];
  let draft=clone(source), language='zh', active='basic', syncEnabled=true, sync, fileManager, previewVersion=0;
  const form=document.getElementById('editor-form'), frame=document.getElementById('site-preview');
  const message=document.getElementById('message'), status=document.getElementById('save-status');
  function notify(text,error=false){message.textContent=text;message.classList.toggle('error',error);if(error)message.scrollIntoView({block:'center'});}
  function confirmAction(text){const dialog=document.getElementById('confirm-dialog');document.getElementById('confirm-text').textContent=text;dialog.returnValue='cancel';return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();});}
  function validLink(value,allowLocal=false){
    if(!value)return true;
    if(/[\u0000-\u0020\\]/.test(value))return false;
    if(allowLocal && /^(\.\/|assets\/)[^:]+$/.test(value))return true;
    try{return /^https?:\/\//i.test(value) && ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}
  }
  function normalize(raw){
    if(!raw || raw.schemaVersion!==2 || !['zh','en'].includes(raw.defaultLanguage))throw Error('不是此主页支持的双语备份文件。');
    const out={schemaVersion:2,defaultLanguage:raw.defaultLanguage};
    for(const k of sharedFields){if(typeof raw[k]!=='string')throw Error('备份缺少有效的联系方式字段。');out[k]=raw[k];}
    for(const lang of ['zh','en']){
      const r=raw[lang];if(!r || typeof r!=='object')throw Error('备份需同时包含中文和英文内容。');
      out[lang]={};
      for(const k of localFields){if(typeof r[k]!=='string')throw Error('个人信息格式不正确。');out[lang][k]=r[k];}
      for(const k of Object.keys(kinds)){
        if(!Array.isArray(r[k]) || r[k].length>500)throw Error('栏目内容格式不正确或条目过多。');
        out[lang][k]=r[k].map(item=>{if(!item||typeof item!=='object')throw Error('条目格式不正确。');const clean={};if(typeof item._syncId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item._syncId))clean._syncId=item._syncId;for(const [f] of fields[k]){if(item[f]!==undefined && typeof item[f]!=='string')throw Error('条目字段必须为文字。');clean[f]=item[f] || '';}if(k==='publications'){if(item.attachments!==undefined&&!Array.isArray(item.attachments))throw Error('论文附件格式不正确。');clean.attachments=(item.attachments||[]).map(a=>{if(!a||typeof a.name!=='string'||typeof a.url!=='string'||!validLink(a.url,true))throw Error('论文附件链接格式不正确。');return {name:a.name,url:a.url,fileId:typeof a.fileId==='string'?a.fileId:''};});}return clean;});
      }
    }
    return out;
  }
  try{const saved=localStorage.getItem(key);if(saved){const data=JSON.parse(saved);draft=normalize(data.profile);syncEnabled=data.syncEnabled!==false;status.textContent='已恢复此浏览器中的草稿';}}catch{status.textContent='草稿存储不可用，可直接下载保存';}
  async function preview(){const version=++previewVersion;const fileLinks=fileManager?.ready?await fileManager.previewLinks():{};if(version!==previewVersion)return;frame.contentWindow?.postMessage({type:'profile-preview',profile:draft,language,fileLinks},location.protocol==='file:'?'*':location.origin);}
  function save(){try{localStorage.setItem(key,JSON.stringify({profile:draft,updatedAt:Date.now(),syncEnabled:sync?sync.enabled:syncEnabled}));status.textContent='已保存到此浏览器 · 尚未发布';}catch{status.textContent='本地保存失败，请下载文件保存';}preview();}
  const syncStatus=document.getElementById('sync-status'),toggleSync=document.getElementById('toggle-sync');
  function showSync(){syncStatus.textContent=sync.enabled?'已开启 · 修改后即时同步':'已暂停 · 两种语言可分别编辑';toggleSync.setAttribute('aria-pressed',String(sync.enabled));toggleSync.textContent=sync.enabled?'暂停同步':'开启同步';}
  sync=new AcademicSync.Controller({profile:draft,enabled:syncEnabled,onChange:save});
  toggleSync.addEventListener('click',()=>{sync.setEnabled(!sync.enabled);showSync();notify(sync.enabled?'已开启。之后的修改会即时同步，已有的不同文字不会立即被覆盖。':'已暂停同步，现在可以分别填写中英文。');});
  document.getElementById('sync-all').addEventListener('click',async()=>{const from=language;if(!await confirmAction(`用${from==='zh'?'中文':'英文'}版的全部内容覆盖另一语言？另一语言中的文字、条目和顺序会被完全替换，不进行翻译。`))return;sync.syncAll(from);notify('已将当前语言的全部内容复制到另一语言。');});
  function field(key,label,value,type='text',attributes='',hint=''){
    const input=type==='textarea'?`<textarea id="f-${key}" ${attributes}>${escape(value)}</textarea>`:`<input id="f-${key}" type="${type==='email'?'email':'text'}" ${type==='url'?'inputmode="url"':''} value="${escape(value)}" ${attributes}>`;
    return `<label class="field" for="f-${key}"><span>${label}</span>${input}${hint?`<p class="field-hint">${hint}</p>`:''}</label>`;
  }
  function renderForm(){
    document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===active)));
    form.hidden=active==='files';document.getElementById('file-manager').hidden=active!=='files';
    if(active==='files'){fileManager?.render();return;}
    if(active==='basic'){
      form.innerHTML=`<div class="field-grid">${field('name','姓名',draft[language].name,'text','data-local="name"')}${field('role','职称 / 学位（可选）',draft[language].role,'text','data-local="role"')}${field('affiliation','学校 / 研究机构',draft[language].affiliation,'text','data-local="affiliation"')}${field('location','城市（可选）',draft[language].location,'text','data-local="location"')}</div>${field('intro','研究简介 / 一句话介绍',draft[language].intro,'text','data-local="intro"')}${field('bio','个人介绍',draft[language].bio,'textarea','data-local="bio"','支持换行；直接填写文字，无需代码。')}<h2 class="form-section-title">共用信息</h2>${field('email','电子邮箱',draft.email,'email','data-shared="email"')}${field('avatar','头像地址（可选）',draft.avatar,'url','data-shared="avatar"','可填 https:// 开头的网址，或 ./assets/avatar.jpg；留空显示姓名首字母。')}${field('github','GitHub 链接',draft.github,'url','data-shared="github"','暂时没有账号可留空。')}${field('scholar','Google Scholar 链接',draft.scholar,'url','data-shared="scholar"')}${field('orcid','ORCID 链接',draft.orcid,'url','data-shared="orcid"')}${field('cv','简历地址',draft.cv,'url','data-shared="cv"','可填 https:// 开头的网址，或 ./assets/cv.pdf。')}<label class="field" for="default-language"><span>首次访问的默认语言</span><select id="default-language" data-default><option value="zh" ${draft.defaultLanguage==='zh'?'selected':''}>中文</option><option value="en" ${draft.defaultLanguage==='en'?'selected':''}>English</option></select></label>`;
    }else{
      const items=draft[language][active];
      form.innerHTML=items.map((r,i)=>`<section class="record"><header class="record-header"><h3>${kinds[active]} ${String(i+1).padStart(2,'0')}</h3><div class="record-actions"><button type="button" class="small-button" data-up="${i}" ${i===0?'disabled':''} aria-label="上移第 ${i+1} 条${kinds[active]}">上移</button><button type="button" class="small-button remove" data-remove="${i}" aria-label="删除第 ${i+1} 条${kinds[active]}">删除</button></div></header>${fields[active].map(([k,label,type])=>field(i+'-'+k,label,r[k],type,`data-record="${i}" data-sync-id="${r._syncId}" data-field="${k}"`)).join('')}${active==='publications'&&fileManager?fileManager.paperControls(r):''}</section>`).join('') || `<div class="editor-empty">还没有${kinds[active]}。开启自动同步后，新增条目会同时出现在两种语言中。</div>`;
      form.innerHTML+=`<button type="button" class="button" data-add>＋ 添加${kinds[active]}</button><p class="field-hint">自动同步开启时，新增、删除和上移会同步到另一语言。</p>`;
    }
  }
  form.addEventListener('submit',e=>e.preventDefault());
  function handleInput(e){const el=e.target;try{if(el.dataset.local)sync.edit(language,{field:el.dataset.local},el.value);else if(el.dataset.shared){draft[el.dataset.shared]=el.value;save();}else if(el.hasAttribute('data-record'))sync.edit(language,{group:active,id:el.dataset.syncId,field:el.dataset.field},el.value);else if(el.hasAttribute('data-default')){draft.defaultLanguage=el.value;save();}}catch(error){showSync();save();notify(error.message,true);}}
  form.addEventListener('input',e=>{if(!e.isComposing)handleInput(e);});
  form.addEventListener('compositionend',handleInput);
  form.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const items=draft[language][active],from=language,group=active;try{if(b.hasAttribute('data-add')){if(items.length>=500||(sync.enabled&&draft[from==='zh'?'en':'zh'][group].length>=500)){notify('每个栏目最多支持 500 条内容。',true);return;}sync.add(from,group);renderForm();form.querySelector('.record:last-of-type input')?.focus();}else if(b.hasAttribute('data-remove')){const itemId=items[Number(b.dataset.remove)]._syncId;if(!await confirmAction(sync.enabled?'删除这条内容及另一语言中的对应条目？':'删除当前语言中的这条内容？'))return;sync.remove(from,group,itemId);renderForm();}else if(b.hasAttribute('data-up')){sync.moveUp(from,group,items[Number(b.dataset.up)]._syncId);renderForm();}}catch(error){notify(error.message,true);}});
  document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.section;renderForm();}));
  document.getElementById('edit-language').addEventListener('change',e=>{language=e.target.value;document.getElementById('preview-language').textContent=language==='zh'?'中文':'English';renderForm();preview();});
  frame.addEventListener('load',preview);
  window.addEventListener('message',e=>{if(e.source===frame.contentWindow && (e.origin===location.origin || (location.protocol==='file:' && e.origin==='null')) && e.data?.type==='profile-ready')preview();});
  function validate(){
    for(const lang of ['zh','en']){
      if(!draft[lang].name.trim())throw Error(`请填写${lang==='zh'?'中文':'英文'}内容中的姓名。`);
      for(const k of Object.keys(kinds))for(const item of draft[lang][k]){
        if(!item.title.trim())throw Error(`请填写${lang==='zh'?'中文':'英文'}${kinds[k]}的标题，或删除空条目。`);
        for(const f of ['url','code','data'])if(item[f]&&!validLink(item[f],true))throw Error('论文、数据或项目链接需使用完整的 https:// 网址，或 ./ 开头的相对路径。');
      }
    }
    if(draft.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))throw Error('请检查电子邮箱格式。');
    for(const k of ['avatar','github','scholar','orcid','cv'])if(!validLink(draft[k],['avatar','cv'].includes(k)))throw Error('请检查共用信息中的链接；使用完整网址，头像和简历也可使用 ./ 开头的路径。');
  }
  function download(name,body,type){const u=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
  fileManager=new AcademicFileManager({profile:()=>draft,language:()=>language,edit:(lang,ref,value)=>{try{sync.edit(lang,ref,value);}finally{showSync();}},save,render:renderForm,preview,notify,confirm:confirmAction,download});
  document.getElementById('download-site').addEventListener('click',async e=>{const button=e.currentTarget;try{validate();button.disabled=true;button.textContent='正在打包…';const archive=await fileManager.export(draft);download('academic-homepage-with-files.zip',archive,'application/zip');notify('完整网站包已生成，包含主页、双语内容、文件夹及附件。解压后可整体发布到 GitHub。');}catch(error){notify(error.message,true);}finally{button.disabled=false;button.textContent='下载完整网站包';}});
  document.getElementById('download-profile').addEventListener('click',()=>{try{validate();download('profile.js','// 通过 editor.html 编辑。\nwindow.PROFILE = '+JSON.stringify(draft,null,2).replace(/</g,'\\u003c')+';\n','text/javascript;charset=utf-8');notify('已生成 profile.js。请替换网站中的同名文件；下载本身不会更新公开主页。');}catch(e){notify(e.message,true);}});
  document.getElementById('export-json').addEventListener('click',()=>{const body=JSON.stringify(draft,null,2);if(new Blob([body]).size>2e6){notify('内容超过 2 MB 备份上限，请先精简较长文字。',true);return;}download('academic-profile-backup.json',body,'application/json');notify('已生成双语内容备份。');});
  document.getElementById('import-json').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw Error('备份文件需小于 2 MB。');const next=normalize(JSON.parse(await file.text()));if(!await confirmAction('用此备份替换当前浏览器中的草稿？'))return;draft=next;sync.setProfile(draft);renderForm();save();notify('已导入备份。请预览并下载更新文件。');}catch(err){notify('导入失败：'+err.message,true);}finally{e.target.value='';}});
  document.getElementById('restore').addEventListener('click',async()=>{if(!await confirmAction('放弃当前草稿，重新读取网站自带的 profile.js 内容？'))return;draft=clone(source);sync.setProfile(draft);renderForm();save();notify('已重新载入网站内容。');});
  for(const mode of ['wide','mobile'])document.getElementById(mode+'-preview').addEventListener('click',()=>{frame.classList.toggle('mobile',mode==='mobile');for(const m of ['wide','mobile'])document.getElementById(m+'-preview').setAttribute('aria-pressed',String(m===mode));});
  renderForm();
  showSync();
  // 可选的浏览器辅助编辑能力；不支持时不影响正常编辑。
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();
    try{Promise.resolve(document.modelContext.registerTool({name:'stage_academic_biography',title:'修改主页简介草稿',description:'修改指定语言的个人介绍并更新本地草稿和预览。开启内容同步时，会将相同文字复制到另一语言；不会翻译、发布或下载文件。',inputSchema:{type:'object',properties:{language:{type:'string',enum:['zh','en']},biography:{type:'string'}},required:['language','biography'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!['zh','en'].includes(input.language)||typeof input.biography!=='string'||input.biography.length>20000||Object.keys(input).some(k=>!['language','biography'].includes(k)))throw Error('需要有效的语言和简介文字。');sync.edit(input.language,{field:'bio'},input.biography);language=input.language;document.getElementById('edit-language').value=language;document.getElementById('preview-language').textContent=language==='zh'?'中文':'English';active='basic';renderForm();preview();return {status:'draft_updated',language,synchronized:sync.enabled,published:false};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
