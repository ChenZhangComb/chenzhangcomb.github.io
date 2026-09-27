(() => {
  'use strict';
  const labels = {
    zh: {about:'关于我',research:'研究方向',publications:'论文发表',projects:'研究项目',education:'教育与经历',home:'科研主页',contact:'联系我',cv:'简历',paper:'论文',code:'代码',data:'数据',project:'查看项目',edit:'编辑主页',preview:'编辑预览 · 尚未发布',bib:'引用',empty:'论文列表待更新。'},
    en: {about:'About',research:'Research',publications:'Publications',projects:'Projects',education:'Education & experience',home:'Academic profile',contact:'Contact',cv:'CV',paper:'Paper',code:'Code',data:'Data',project:'View project',edit:'Edit profile',preview:'Editor preview · Not published',bib:'Cite',empty:'Publication list to be updated.'}
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = value => {
    const s = String(value || '').trim();
    if (!s || /[\u0000-\u0020\\]/.test(s) || s.startsWith('//')) return '';
    if (/^https?:\/\//i.test(s)) {try {return ['http:','https:'].includes(new URL(s).protocol) ? s : '';} catch {return '';}}
    return /^(\.\/|assets\/)[^:]+$/.test(s) ? s : '';
  };
  let previewFileLinks={};
  const link = (href,text,cls='') => url(href) ? `<a class="${cls}" href="${esc(previewFileLinks[url(href)]||url(href))}" target="_blank" rel="noopener noreferrer">${text}</a>` : '';
  const attachmentLink=item=>url(item.url)?`<a class="attachment-download" href="${esc(previewFileLinks[url(item.url)]||url(item.url))}" download="${esc(item.name)}">↓ ${esc(item.name)}</a>`:'';
  const list = v => Array.isArray(v) ? v.filter(x=>x && typeof x==='object') : [];
  const section = (id,n,title,body) => `<section class="section" id="${id}"><div class="section-heading"><span class="section-number">${n}</span><h2>${title}</h2></div>${body}</section>`;
  let observer, profile=window.PROFILE;
  let language=new URLSearchParams(location.search).get('lang');
  if(!['zh','en'].includes(language)) {try{language=localStorage.getItem('academic-language');}catch{}}
  if(!['zh','en'].includes(language)) language=profile.defaultLanguage || 'zh';
  function render(data) {
    if (!data || typeof data!=='object') return;
    profile=data;
    const p={...data,...data[language],language};
    const l=labels[p.language] || labels.zh;
    // Newest year first; equal or missing years retain the editor's manual order.
    const publications=list(p.publications).map((paper,index)=>({paper,index,year:Number(String(paper.year||'').match(/\b\d{4}\b/)?.[0]||0)})).sort((a,b)=>b.year-a.year||a.index-b.index).map(row=>row.paper);
    document.documentElement.lang=p.language==='en'?'en':'zh-CN';
    document.title=`${p.name || l.home} · ${l.home}`;
    document.querySelector('meta[name="description"]').content=[p.name,p.role,p.affiliation,p.intro].filter(Boolean).join(' · ');
    const groups=['about','research','publications','projects','education'].filter(k=>k==='about' ? !!p.bio : k==='publications' || list(p[k]).length);
    const numbers=Object.fromEntries(groups.map((k,i)=>[k,String(i+1).padStart(2,'0')]));
    const nav=groups.map(k=>`<a href="#${k}"><span>${numbers[k]}</span>${l[k]}</a>`).join('');
    const email=typeof p.email==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? p.email : '';
    const avatar=previewFileLinks[url(p.avatar)]||url(p.avatar);
    const initials=(p.name || 'R').trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
    const preview=new URLSearchParams(location.search).has('preview');
    document.getElementById('app').innerHTML=`${preview?`<div class="preview-banner">${l.preview}</div>`:''}<div class="shell">
      <aside class="sidebar"><a class="wordmark" href="#main"><span class="mark" aria-hidden="true">c</span>Academic / Profile</a><div class="identity"><div class="avatar">${avatar?`<img src="${esc(avatar)}" alt="${esc(p.name)}">`:esc(initials)}</div><div class="sidebar-name">${esc(p.name)}</div><div class="sidebar-role">${esc(p.role)}</div><div class="sidebar-affiliation">${esc(p.affiliation)}</div></div><nav class="nav" aria-label="${p.language==='en'?'Page sections':'页面导航'}">${nav}</nav><div class="sidebar-bottom">${esc(p.location)}${email?`<a href="mailto:${encodeURIComponent(email)}">${esc(email)}</a>`:''}</div></aside>
      <main class="main" id="main"><header class="hero"><div class="hero-top"><div class="eyebrow">Academic homepage</div><div class="language-switch" aria-label="Language"><button type="button" data-language="zh" aria-pressed="${language==='zh'}">中文</button><span aria-hidden="true">/</span><button type="button" data-language="en" aria-pressed="${language==='en'}">EN</button></div></div><h1 class="hero-name">${esc(p.name)}</h1>${p.affiliation?`<p class="english-name">${esc(p.affiliation)}</p>`:''}<p class="intro">${esc(p.intro)}</p><div class="hero-links">${email?`<a class="pill primary" href="mailto:${encodeURIComponent(email)}">${l.contact}<span aria-hidden="true">↗</span></a>`:''}${link(p.scholar,'Google Scholar','pill')}${link(p.github,'GitHub','pill')}${link(p.orcid,'ORCID','pill')}${link(p.cv,l.cv,'pill')}</div></header>
      ${p.bio?section('about',numbers.about,l.about,`<div class="prose">${esc(p.bio)}</div>`):''}
      ${list(p.research).length?section('research',numbers.research,l.research,`<div class="research-grid">${list(p.research).map(r=>`<article class="research-item"><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p></article>`).join('')}</div>`):''}
      ${section('publications',numbers.publications,l.publications,publications.length?publications.map((r,i)=>`<article class="publication"><div class="pub-year">${esc(r.year)}</div><div><h3>${esc(r.title)}</h3><p class="authors">${esc(r.authors)}</p><p class="venue">${esc(r.venue)}${r.note?`<span class="note">${esc(r.note)}</span>`:''}</p><div class="pub-links">${link(r.url,l.paper+' ↗')}${link(r.code,l.code+' ↗')}${link(r.data,l.data+' ↗')}${r.bibtex?`<button type="button" class="text-button" aria-expanded="false" aria-controls="bib-${i}" data-bib="bib-${i}">BibTeX</button>`:''}</div>${list(r.attachments).length?`<div class="data-attachments" aria-label="${l.data}">${list(r.attachments).map(attachmentLink).join('')}</div>`:''}${r.bibtex?`<pre id="bib-${i}" class="bibtex" hidden>${esc(r.bibtex)}</pre>`:''}</div></article>`).join(''):`<p class="empty-state">${l.empty}</p>`)}
      ${list(p.projects).length?section('projects',numbers.projects,l.projects,`<div class="project-grid">${list(p.projects).map(r=>`<article class="project"><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p>${r.tags?`<div class="tags">${String(r.tags).split(/[,，]/).map(t=>t.trim()).filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}${link(r.url,l.project+' ↗','project-link')}</article>`).join('')}</div>`):''}
      ${list(p.education).length?section('education',numbers.education,l.education,list(p.education).map(r=>`<article class="experience"><div class="period">${esc(r.period)}</div><div><h3>${esc(r.title)}</h3><p>${esc(r.institution)}</p><p class="detail">${esc(r.description)}</p></div></article>`).join('')):''}
      <footer class="footer"><span>© ${new Date().getFullYear()} ${esc(p.name)}</span><a href="./editor.html">${l.edit} ↗</a></footer></main></div>`;
    document.querySelector('.avatar img')?.addEventListener('error',e=>{e.target.parentElement.textContent=initials;});
    document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.language;try{localStorage.setItem('academic-language',language);}catch{}render(profile);}));
    document.querySelectorAll('[data-bib]').forEach(button=>button.addEventListener('click',()=>{const pre=document.getElementById(button.dataset.bib);pre.hidden=!pre.hidden;button.setAttribute('aria-expanded',String(!pre.hidden));}));
    observer?.disconnect();
    observer=new IntersectionObserver(entries=>{const active=entries.find(e=>e.isIntersecting);if(active){document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+active.target.id));}}, {rootMargin:'-10% 0px -60% 0px'});
    document.querySelectorAll('.section').forEach(el=>observer.observe(el));
  }
  render(window.PROFILE);
  if (window.parent !== window && new URLSearchParams(location.search).has('preview')) {
    window.addEventListener('message',e=>{if(e.source===window.parent && (e.origin===location.origin || (location.protocol==='file:' && e.origin==='null')) && e.data?.type==='profile-preview') {if(['zh','en'].includes(e.data.language)) language=e.data.language;previewFileLinks=Object.fromEntries(Object.entries(e.data.fileLinks||{}).filter(([key,value])=>url(key)&&typeof value==='string'&&value.startsWith('blob:')));render(e.data.profile);}});
    window.parent.postMessage({type:'profile-ready'},location.protocol==='file:'?'*':location.origin);
  }
})();
