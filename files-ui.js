(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const size=bytes=>bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':bytes<1024*1024*1024?(bytes/1024/1024).toFixed(1)+' MB':(bytes/1024/1024/1024).toFixed(2)+' GB';
  class Manager{
    constructor(options){
      this.options=options;this.folder='';this.ready=false;this.busy=false;
      this.store=new AcademicFiles.Store({scope:location.pathname,manifest:window.SITE_FILES,onWarning:text=>{document.getElementById('file-storage-status').textContent=text;}});
      this.panel=document.getElementById('file-manager');
      this.panel.addEventListener('click',e=>this.onClick(e));
      this.panel.addEventListener('change',e=>{if(e.target.id==='library-upload')this.upload(e.target,this.folder);});
      document.getElementById('editor-form').addEventListener('change',e=>this.paperChange(e));
      document.getElementById('editor-form').addEventListener('click',e=>this.paperClick(e));
      this.initialization=this.store.init().then(()=>{this.ready=true;this.render();this.options.render();this.options.preview();});
    }
    folderOptions(selected=''){return this.store.folders.slice().sort().map(folder=>`<option value="${esc(folder)}" ${folder===selected?'selected':''}>${esc(folder||'文件库根目录')}</option>`).join('');}
    paperControls(paper){
      const list=Array.isArray(paper.attachments)?paper.attachments:[];
      return `<div class="paper-files"><h4>论文文件与研究数据</h4><label class="field"><span>上传到文件夹</span><select data-paper-folder="${paper._syncId}" aria-label="论文附件保存文件夹" ${!this.ready?'disabled':''}>${this.folderOptions()}</select></label><div class="file-buttons"><label class="button file-label">上传论文 PDF<input type="file" accept=".pdf,application/pdf" data-paper-upload="${paper._syncId}" data-kind="pdf" ${!this.ready?'disabled':''}></label><label class="button file-label">上传数据 / 附件<input type="file" multiple data-paper-upload="${paper._syncId}" data-kind="data" ${!this.ready?'disabled':''}></label></div><p class="field-hint">PDF 会填入论文链接；数据支持 CSV、Excel、ZIP 等文件。不设单文件大小上限，实际容量取决于浏览器和设备。</p>${this.store.files.length?`<div class="attach-existing"><label for="existing-${paper._syncId}">从文件库选择数据</label><select id="existing-${paper._syncId}" data-existing-file="${paper._syncId}"><option value="">选择已上传文件</option>${this.store.files.map(file=>`<option value="${file.id}">${esc(file.path)}</option>`).join('')}</select><button type="button" class="button" data-attach-file="${paper._syncId}">添加到论文</button></div>`:''}${list.length?`<ul class="attachment-list">${list.map((item,index)=>`<li><span>${esc(item.name)}</span><button type="button" class="text-button" data-detach-paper="${paper._syncId}" data-attachment-index="${index}">移除关联</button></li>`).join('')}</ul>`:'<p class="field-hint">此论文尚未关联数据附件。</p>'}</div>`;
    }
    render(){
      const folders=this.store.folders.filter(folder=>folder&&AcademicFiles.folderOf(folder)===this.folder),files=this.store.files.filter(file=>AcademicFiles.folderOf(file.path)===this.folder);
      document.getElementById('library-location').textContent='文件库'+(this.folder?' / '+this.folder:'');
      document.getElementById('library-size').textContent=`${this.store.files.length} 个文件 · ${size(this.store.files.reduce((n,f)=>n+f.size,0))} · 未设大小上限`;
      document.getElementById('parent-folder').disabled=!this.folder;
      document.getElementById('library-list').innerHTML=[...folders.sort().map(folder=>`<li class="library-row"><button type="button" class="folder-open" data-open-folder="${esc(folder)}"><span aria-hidden="true">▣</span>${esc(folder.split('/').pop())}</button><button type="button" class="text-button" data-delete-folder="${esc(folder)}">删除空文件夹</button></li>`),...files.map(file=>`<li class="library-row"><div class="file-description"><strong>${esc(file.name)}</strong><span>${size(file.size)}</span><input class="file-path" readonly aria-label="${esc(file.name)} 的网站路径" value="${esc(AcademicFiles.href(file.path))}"></div><div class="file-row-actions"><button type="button" class="text-button" data-download-file="${file.id}">下载</button><button type="button" class="text-button remove" data-delete-file="${file.id}">删除</button></div></li>`)].join('')||'<li class="editor-empty">此文件夹为空。可以建立子文件夹或上传文件。</li>';
      document.getElementById('library-upload').disabled=!this.ready||this.busy;
    }
    async transaction(action){
      await this.initialization;
      if(this.busy){this.options.notify('文件正在处理，请稍后再试。');return;}
      this.busy=true;this.panel.setAttribute('aria-busy','true');
      try{await action();}catch(error){this.options.notify(error.message,true);}
      finally{this.busy=false;this.panel.removeAttribute('aria-busy');this.render();this.options.render();this.options.preview();}
    }
    async upload(input,folder,paperId,kind,lang){
      const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
      await this.transaction(async()=>{
        if(kind==='pdf'&&(files.length!==1||!files[0].name.toLowerCase().endsWith('.pdf')))throw Error('请选择一个 PDF 文件。');
        const added=await this.store.upload(folder,files);
        if(paperId){const paper=this.options.profile()[lang].publications.find(p=>p._syncId===paperId);if(!paper)throw Error('文件已保存到文件库，但原论文条目已被删除。');
          if(kind==='pdf')this.options.edit(lang,{group:'publications',id:paperId,field:'url'},AcademicFiles.href(added[0].path));
          else this.attach(lang,paperId,added);
        }
        this.options.notify(`已保存 ${added.length} 个文件${paperId?'并关联到论文':''}。${this.store.durable?'发布时请下载完整网站包。':'仅保留在本次编辑中，请在关闭页面前下载完整网站包。'}`,!this.store.durable);
      });
    }
    attach(lang,paperId,files){
      const paper=this.options.profile()[lang].publications.find(p=>p._syncId===paperId);if(!paper)return;
      const attachments=Array.isArray(paper.attachments)?paper.attachments.slice():[];
      for(const file of files)if(!attachments.some(item=>item.fileId===file.id))attachments.push({fileId:file.id,name:file.name,url:AcademicFiles.href(file.path)});
      this.options.edit(lang,{group:'publications',id:paperId,field:'attachments'},attachments);
    }
    async paperChange(e){const input=e.target;if(!input.dataset.paperUpload)return;const paperId=input.dataset.paperUpload,lang=this.options.language(),select=document.querySelector(`[data-paper-folder="${paperId}"]`);await this.upload(input,select?.value||'',paperId,input.dataset.kind,lang);}
    async paperClick(e){const button=e.target.closest('button');if(!button)return;
      if(button.dataset.attachFile){const paperId=button.dataset.attachFile,select=document.querySelector(`[data-existing-file="${paperId}"]`),file=this.store.files.find(f=>f.id===select?.value);if(!file){this.options.notify('请先选择一个文件。');return;}try{this.attach(this.options.language(),paperId,[file]);this.options.render();this.options.preview();}catch(error){this.options.notify(error.message,true);}}
      if(button.dataset.detachPaper){const paperId=button.dataset.detachPaper,lang=this.options.language(),paper=this.options.profile()[lang].publications.find(p=>p._syncId===paperId);if(!paper)return;const updated=(paper.attachments||[]).filter((_,index)=>index!==Number(button.dataset.attachmentIndex));try{this.options.edit(lang,{group:'publications',id:paperId,field:'attachments'},updated);}catch(error){this.options.notify(error.message,true);}this.options.render();this.options.preview();}
    }
    async onClick(e){const button=e.target.closest('button');if(!button)return;
      if(button.dataset.openFolder!==undefined){this.folder=button.dataset.openFolder;this.render();return;}
      if(button.id==='parent-folder'){this.folder=AcademicFiles.folderOf(this.folder);this.render();return;}
      if(button.id==='create-folder'){const input=document.getElementById('folder-name'),name=input.value;await this.transaction(async()=>{await this.store.addFolder(this.folder,name);input.value='';this.options.notify('文件夹已建立。');});return;}
      if(button.dataset.downloadFile){await this.transaction(async()=>{const file=this.store.files.find(f=>f.id===button.dataset.downloadFile);this.options.download(file.name,await this.store.blob(file.id),'application/octet-stream');});return;}
      if(button.dataset.deleteFolder){await this.transaction(async()=>{await this.store.removeFolder(button.dataset.deleteFolder);this.options.notify('空文件夹已删除。');});return;}
      if(button.dataset.deleteFile){const file=this.store.files.find(f=>f.id===button.dataset.deleteFile);if(!file)return;const references=this.references(file);if(!await this.options.confirm(`删除文件「${file.name}」${references?'，并解除两种语言中对它的引用':''}？`))return;
        await this.transaction(async()=>{const link=AcademicFiles.href(file.path),profile=this.options.profile();for(const lang of ['zh','en']){for(const paper of profile[lang].publications){for(const field of ['url','code','data'])if(paper[field]===link)paper[field]='';paper.attachments=(paper.attachments||[]).filter(item=>item.fileId!==file.id&&item.url!==link);}for(const project of profile[lang].projects)if(project.url===link)project.url='';}for(const field of ['avatar','cv'])if(profile[field]===link)profile[field]='';await this.store.remove(file.id);this.options.save();this.options.notify('文件已删除，相关链接已移除。');});
      }
    }
    references(file){const link=AcademicFiles.href(file.path),profile=this.options.profile();return ['zh','en'].some(lang=>profile[lang].publications.some(p=>p.url===link||p.code===link||p.data===link||(p.attachments||[]).some(a=>a.fileId===file.id||a.url===link))||profile[lang].projects.some(p=>p.url===link))||profile.avatar===link||profile.cv===link;}
    async previewLinks(){const result={};for(const file of this.store.files){try{result[AcademicFiles.href(file.path)]=await this.store.url(file.id);}catch{}}return result;}
    async export(profile){await this.initialization;if(this.busy)throw Error('请等待文件处理完成再打包。');this.busy=true;try{return await AcademicFiles.exportSite({store:this.store,profile:JSON.parse(JSON.stringify(profile)),sources:window.SITE_SOURCE,onProgress:text=>this.options.notify(text)});}finally{this.busy=false;}}
  }
  window.AcademicFileManager=Manager;
})();
