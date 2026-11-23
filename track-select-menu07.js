(function(){
 'use strict';
 // A new release adds one entry and its gameplay module; the directory never changes layout.
 const catalog=[
   {id:'01',title:'要举止得体',artist:'情绪 × 星界',cover:'assets/packed/court.webp',stage:'情绪与星界演奏舞台'},
   {id:'02',title:'这样就死掉的话也太没出息了！',artist:'夏色祭 × 百鬼绫目',cover:'assets/song02/cover.png',stage:'夏色祭与百鬼绫目演奏舞台',data:'SONG02_DATA',pixel:true}
 ];
 const q=new URLSearchParams(location.search);
 let selected=(catalog.find(t=>t.id===q.get('song'))||catalog[0]).id;
 const music=document.getElementById('music'),one=window.COURT_DATA,two=window.SONG02_DATA;
 const tracks={
   '01':{data:one,audio:{file:music.dataset.src,bytes:Number(music.dataset.bytes),sha256:music.dataset.sha256}},
   '02':{data:{chart:two.chart,config:two.config},audio:two.audio}
 };
 const list=document.getElementById('track-list'),hint=document.getElementById('track-scroll-hint');
 function setSelected(id,updateURL=false){
   const meta=catalog.find(t=>t.id===id);if(!meta)return;
   selected=id;window.LOCAL_TRACK=id;document.body.dataset.localTrack=id;
   for(const tile of list.querySelectorAll('.track-card')){
     const active=tile.dataset.song===id;tile.setAttribute('aria-pressed',String(active));
     tile.querySelector('.track-state').textContent=active?'→':'↗';
   }
   document.getElementById('current-number').textContent=id;
   document.getElementById('current-title').textContent=meta.title;
   const preview=document.getElementById('track-preview'),image=preview.querySelector('img');
   preview.dataset.pixel=String(!!meta.pixel);image.dataset.src=meta.cover;image.alt=meta.title+'的游戏场景';
   if(updateURL||image.hasAttribute('src'))image.src=meta.cover;
   document.getElementById('stage').setAttribute('aria-label',meta.stage);
   if(updateURL){
     const u=new URL(location.href);u.searchParams.set('song',id);u.searchParams.set('view','select');
     history.replaceState(history.state,'',u.href);
   }
 }
 window.FNFTrackMenu={tracks,selected:()=>selected,setSelected};
 window.COURT_DATA=tracks[selected].data;
 Object.assign(music.dataset,{src:tracks[selected].audio.file,bytes:String(tracks[selected].audio.bytes),sha256:tracks[selected].audio.sha256});
 const navigate=id=>{
   // Keep the current document and audio context alive. Every physical
   // click gets the original confirmation; no navigation debounce.
   window.CourtSounds?.play('confirmMenu',{volume:.65});
   if(id!==selected&&window.selectTrackInPlace?.(id))setSelected(id,true);
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
   all[next].focus();all[next].scrollIntoView({block:'nearest'});if(next!==i)window.CourtSounds?.play('scrollMenu',{volume:.65,channel:'track-focus'});
 });
 window.refreshTrackList=()=>{hint.hidden=list.scrollHeight<=list.clientHeight+2;};
 if(window.ResizeObserver)new ResizeObserver(()=>{if(list.clientHeight>0)hint.hidden=list.scrollHeight<=list.clientHeight+2;}).observe(list);
 document.getElementById('track-count').textContent=catalog.length;
 setSelected(selected);
})();
