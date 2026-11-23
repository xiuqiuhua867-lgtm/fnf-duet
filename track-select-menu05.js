(function(){
 'use strict';
 // A new release adds one entry and its gameplay module; the directory never changes layout.
 const catalog=[
   {id:'01',title:'要举止得体',artist:'情绪 × 星界',cover:'assets/packed/court.webp',stage:'情绪与星界演奏舞台'},
   {id:'02',title:'这样就死掉的话也太没出息了！',artist:'夏色祭 × 百鬼绫目',cover:'assets/song02/cover.png',stage:'夏色祭与百鬼绫目演奏舞台',data:'SONG02_DATA',pixel:true}
 ];
 const q=new URLSearchParams(location.search),meta=catalog.find(t=>t.id===q.get('song'))||catalog[0],selected=meta.id;
 window.LOCAL_TRACK=selected;document.body.dataset.localTrack=selected;
 const list=document.getElementById('track-list'),hint=document.getElementById('track-scroll-hint');
 const resumeScroll=()=>{try{return JSON.parse(sessionStorage.getItem('track-scroll')||'null')}catch{return null}};
 let switching=false;
 const selectCue=()=>window.CourtSounds?.play('scrollMenu',{volume:.78,offset:.05,channel:'track-switch'});
 const navigate=id=>{
   if(switching)return;
   const voice=selectCue();
   if(id===selected)return;
   switching=true;
   const began=performance.now();
   function finish(){
     const overlay=document.getElementById('menu-overlay');
     if(document.body.dataset.phase!=='menu'||overlay.hidden||overlay.dataset.view!=='song'){switching=false;return;}
     const webPlayed=voice?.source&&voice.ctx.currentTime-voice.startedAt>=.095;
     const nativePlayed=voice?.element&&!voice.element.paused&&voice.element.currentTime>=.145;
     // A page navigation closes the old document's audio. Let the
     // short cue sound first; a blocked/slow audio engine never locks navigation.
     if(voice&&voice.relative>0&&(voice.gain?.gain.value??voice.element?.volume??1)>0&&!webPlayed&&!nativePlayed&&performance.now()-began<190){
       setTimeout(finish,16);return;
     }
     try{sessionStorage.setItem('track-scroll',JSON.stringify({id,top:list.scrollTop}))}catch{}
     const u=new URL(location.href);u.searchParams.set('song',id);u.searchParams.set('view','select');location.assign(u.href);
   }
   finish();
 };
 const element=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e};
 for(const item of catalog){
   const active=item.id===selected,tile=element('button','track-card');
   tile.type='button';tile.id='track'+item.id;tile.dataset.song=item.id;tile.setAttribute('aria-pressed',String(active));
   const no=element('span','track-number',item.id),copy=element('span','track-caption'),state=element('span','track-state',active?'→':'↗');
   copy.append(element('strong','',item.title),element('small','',item.artist));state.setAttribute('aria-hidden','true');
   tile.append(no,copy,state);tile.onclick=()=>navigate(item.id);list.append(tile);
 }
 list.addEventListener('keydown',e=>{
   if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
   const all=[...list.querySelectorAll('button')],i=all.indexOf(document.activeElement);if(i<0)return;
   e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?all.length-1:Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowUp'?-1:1)));
   all[next].focus();all[next].scrollIntoView({block:'nearest'});if(next!==i)selectCue();
 });
 window.refreshTrackList=()=>{hint.hidden=list.scrollHeight<=list.clientHeight+2;const old=resumeScroll();if(old?.id===selected){list.scrollTop=old.top;try{sessionStorage.removeItem('track-scroll')}catch{}}};
 if(window.ResizeObserver)new ResizeObserver(()=>{if(list.clientHeight>0)hint.hidden=list.scrollHeight<=list.clientHeight+2}).observe(list);
 document.getElementById('track-count').textContent=catalog.length;
 document.getElementById('current-number').textContent=selected;
 document.getElementById('current-title').textContent=meta.title;
 const preview=document.getElementById('track-preview'),image=preview.querySelector('img');
 preview.dataset.pixel=String(!!meta.pixel);image.dataset.src=meta.cover;image.alt=meta.title+'的游戏场景';
 document.getElementById('stage').setAttribute('aria-label',meta.stage);
 if(meta.data){
   const m=window[meta.data];window.COURT_DATA={chart:m.chart,config:m.config};
   const a=document.getElementById('music');a.dataset.src=m.audio.file;a.dataset.bytes=String(m.audio.bytes);a.dataset.sha256=m.audio.sha256;
 }
})();
