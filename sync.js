(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AcademicSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const languages=['zh','en'];
  const groups=['research','publications','projects','education'];
  const basics=['name','role','affiliation','location','intro','bio'];
  const fields={research:['title','description'],publications:['title','authors','venue','year','note','url','code','data','bibtex','attachments'],projects:['title','description','tags','url'],education:['period','title','institution','description']};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const other=lang=>lang==='zh'?'en':'zh';
  const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
  const newId=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'r-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const publicationYear=paper=>Number(String(paper?.year||'').match(/\b\d{4}\b/)?.[0]||0);
  function orderedPublications(items){return (Array.isArray(items)?items:[]).map((paper,index)=>({paper,index})).sort((a,b)=>publicationYear(b.paper)-publicationYear(a.paper)||a.index-b.index).map(row=>row.paper);}
  function migrate(profile){
    for(const group of groups){
      const a=profile.zh[group],b=profile.en[group];
      // Old versions have no IDs: pair equally sized lists in their existing order.
      // Unequal lists stay separate instead of overwriting unrelated records.
      if(a.length===b.length)for(let i=0;i<a.length;i++)if(!validId(a[i]._syncId)&&!validId(b[i]._syncId))a[i]._syncId=b[i]._syncId=newId();
      for(const lang of languages){const seen=new Set();for(const item of profile[lang][group]){if(!validId(item._syncId)||seen.has(item._syncId))item._syncId=newId();seen.add(item._syncId);}}
    }
    return profile;
  }
  function alignSharedOrder(profile,from,group){
    const source=profile[from][group],target=profile[other(from)][group];
    const targetById=new Map(target.map(item=>[item._syncId,item]));
    const ordered=source.filter(item=>targetById.has(item._syncId)).map(item=>targetById.get(item._syncId));
    const sharedIds=new Set(ordered.map(item=>item._syncId));let next=0;
    // Keep target-only records in their original slots and preserve every record's text.
    for(let i=0;i<target.length;i++)if(sharedIds.has(target[i]._syncId))target[i]=ordered[next++];
  }
  class Controller{
    constructor({profile,enabled=true,onChange=()=>{},orderFrom='zh'}){this.profile=migrate(profile);this.enabled=enabled;this.onChange=onChange;this.normalizePublicationOrder(orderFrom);}
    normalizePublicationOrder(from='zh'){
      for(const lang of languages)this.profile[lang].publications=orderedPublications(this.profile[lang].publications);
      if(this.enabled){alignSharedOrder(this.profile,languages.includes(from)?from:'zh','publications');const target=other(languages.includes(from)?from:'zh');this.profile[target].publications=orderedPublications(this.profile[target].publications);}
    }
    setProfile(profile,from='zh'){this.profile=migrate(profile);this.normalizePublicationOrder(from);}
    setEnabled(enabled,from='zh'){this.enabled=Boolean(enabled);this.normalizePublicationOrder(from);this.onChange();}
    get(lang,ref){return ref.group?this.profile[lang][ref.group].find(item=>item._syncId===ref.id):this.profile[lang];}
    edit(from,ref,value){
      const source=this.get(from,ref);if(!source)return;
      source[ref.field]=value;
      let dest=this.get(other(from),ref);
      if(this.enabled&&!dest){
        if(this.profile[other(from)][ref.group].length>=500){this.enabled=false;this.onChange();throw Error('当前修改已保存，但另一语言的栏目已满 500 条，未能同步。同步已暂停；删除多余条目后可重新开启。');}
        dest=clone(source);this.profile[other(from)][ref.group].push(dest);
        alignSharedOrder(this.profile,from,ref.group);
      }
      if(this.enabled)dest[ref.field]=value&&typeof value==='object'?clone(value):value;
      if(ref.group==='publications')this.normalizePublicationOrder(from);
      this.onChange();
    }
    add(from,group){
      if(this.profile[from][group].length>=500||(this.enabled&&this.profile[other(from)][group].length>=500))throw Error('每个栏目最多支持 500 条内容。');
      const item={_syncId:newId(),...Object.fromEntries(fields[group].map(field=>[field,field==='attachments'?[]:'']))};
      this.profile[from][group].push(item);
      if(this.enabled){this.profile[other(from)][group].push(clone(item));alignSharedOrder(this.profile,from,group);}
      if(group==='publications')this.normalizePublicationOrder(from);
      this.onChange();return item;
    }
    remove(from,group,itemId){
      for(const lang of this.enabled?languages:[from])this.profile[lang][group]=this.profile[lang][group].filter(item=>item._syncId!==itemId);
      this.onChange();
    }
    moveUp(from,group,itemId){
      if(group==='publications')this.normalizePublicationOrder(from);
      const arr=this.profile[from][group],index=arr.findIndex(item=>item._syncId===itemId);if(index<1)return;
      if(group==='publications'&&publicationYear(arr[index])!==publicationYear(arr[index-1]))return;
      [arr[index-1],arr[index]]=[arr[index],arr[index-1]];
      if(this.enabled)alignSharedOrder(this.profile,from,group);
      if(group==='publications')this.normalizePublicationOrder(from);
      this.onChange();
    }
    syncAll(from){
      const target=other(from);
      for(const field of basics)this.profile[target][field]=this.profile[from][field];
      for(const group of groups)this.profile[target][group]=clone(this.profile[from][group]);
      this.normalizePublicationOrder(from);
      this.onChange();
    }
  }
  return {Controller,migrate,fields,basics,groups,publicationYear,orderedPublications};
});
