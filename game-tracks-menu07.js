(function(){
'use strict';
const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d',{alpha:false});
let audio=CourtSounds.createMusic($('music'));
// Retire the optional hit-sound control even if an older HTML page is cached.
const obsoleteHitControl=$('hit-sound');
if(obsoleteHitControl)(obsoleteHitControl.closest('.setting-line')||obsoleteHitControl).remove();
const testMode=new URLSearchParams(location.search).get('test')==='1'&&
 (location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname));
const performanceDisplay=CourtPerformance.create(canvas,$('viewport'),$('performance-panel'));
const visualClock=new CourtPerformance.VisualClock();
const settingTabs=['sound','control','display'];
const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const ARROWS={ArrowLeft:0,ArrowDown:1,ArrowUp:2,ArrowRight:3},physical=new Set();
const DEFAULTS={music:.85,sfx:.45,failureSound:'mode',offsetMs:0,downscroll:false,scrollMultiplier:1,quality:'auto',performanceMonitor:false,keys:['KeyA','KeyS','KeyW','KeyD']};
let baseScrollSpeed=COURT_DATA?.config.scrollSpeed||870;
const renderScrollSpeed=()=>baseScrollSpeed*settings.scrollMultiplier;
let TRACK=window.LOCAL_TRACK||'01';
const STORE='rhythm-court26';let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{}
if(!saved||typeof saved!=='object')saved={};
let settings={...DEFAULTS},records={};
for(const key of Object.keys(DEFAULTS))if(saved.settings&&hasOwn(saved.settings,key))settings[key]=saved.settings[key];
function trackRecords(track){
 let store={};try{store=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
 const result={};
 for(const mode of ['easy','standard']){
  const {max:highest,count}=TRACK_MANIFEST[track].limits[mode];
  const r=store.recordsByDifficulty?.[track]?.[mode]??(mode==='standard'?(track==='01'?store.records:store.recordsBySong?.[track])?.formal:null);
  if(r&&Number.isSafeInteger(r.score)&&r.score>=-10000000&&r.score<=highest&&
     Number.isFinite(r.accuracy)&&r.accuracy>=0&&r.accuracy<=100&&
     Number.isSafeInteger(r.combo)&&r.combo>=0&&r.combo<=count&&
     Number.isSafeInteger(r.misses)&&r.misses>=0&&r.misses<=1000000)
   result[mode]={score:r.score,accuracy:r.accuracy,combo:r.combo,misses:r.misses};
 }
 return result;
}
records=trackRecords(TRACK);
settings.downscroll=settings.downscroll===true;
settings.performanceMonitor=settings.performanceMonitor===true;
settings.quality=CourtPerformance.qualities.includes(settings.quality)?settings.quality:'auto';
settings.keys=Array.isArray(settings.keys)&&settings.keys.length===4&&new Set(settings.keys).size===4&&settings.keys.every(key=>typeof key==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(key)&&key!=='KeyR')?settings.keys:[...DEFAULTS.keys];
function settingNumber(value,fallback,min,max){
 const number=typeof value==='number'||typeof value==='string'?Number(value):NaN;
 return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
}
for(const name of ['music','sfx'])settings[name]=settingNumber(settings[name],DEFAULTS[name],0,1);
settings.offsetMs=settingNumber(settings.offsetMs,DEFAULTS.offsetMs,-200,200);
settings.scrollMultiplier=Math.round(settingNumber(settings.scrollMultiplier,DEFAULTS.scrollMultiplier,.5,2)*20)/20;
settings.failureSound=['mode','off','on'].includes(settings.failureSound)?settings.failureSound:'mode';
let data,engine,ready=false,phase='menu',autoplay=false,practice=false,lastState=null,highestCombo=0;
let pendingMode=null;
const slots=new Map(),groups=()=>({ui:false,scene:false,chart:false,audio:false,effects:false});
function createSlot(id,player){
 const spec=window.FNFTrackMenu.tracks[id];
 if(!player){
  const element=document.createElement('audio');element.preload='none';element.playsInline=true;
  Object.assign(element.dataset,{src:spec.audio.file,bytes:String(spec.audio.bytes),sha256:spec.audio.sha256});
  player=CourtSounds.createMusic(element);
 }
 const slot={id,audio:player,datum:spec.data,ui:spec.ui,scene:spec.scene,ready:false,preparation:null,error:'',runtimeError:null,groups:groups(),cacheChecked:false};
 slots.set(id,slot);bindMusic(slot);return slot;
}
let activeSlot=createSlot(TRACK,audio);
let preparation=null,preparationError='',prepGroups=activeSlot.groups;
function syncSlot(s){
 if(s!==activeSlot)return;
 ready=s.ready;preparation=s.preparation;preparationError=s.error;prepGroups=s.groups;runtimeError=s.runtimeError;
}
function bindMusic(s){
 const on=(event,fn)=>s.audio.addEventListener(event,()=>{if(s===activeSlot)fn();});
 s.audio.addEventListener('pause',()=>s.scene?.pauseStage?.());
 on('progress',showPreparation);on('ended',endSong);
 on('error',()=>{if(phase==='playing'&&debugTime===null)pause('乐曲读取中断，计分已暂停。点击继续演奏恢复。');});
 for(const event of ['waiting','seeking','pause','ended'])on(event,()=>{if(event==='waiting')audioWaiting=true;visualClock.reset();});
 on('playing',()=>{audioWaiting=false;visualClock.reset();});
}
window.selectTrackInPlace=function(id){
 if(phase!=='menu'||menuPage!=='song'||!window.FNFTrackMenu.tracks[id])return false;
 if(id===TRACK)return true;
 persist();CourtScene.pauseStage?.();audio.pause();audio.currentTime=0;pendingMode=null;clearPhysical();setExport(false);
 sessionToken++;debugTime=null;exportEngine=null;engine=null;lastState=null;highestCombo=0;
 TRACK=id;const s=slots.get(id)||createSlot(id,null);activeSlot=s;audio=s.audio;s.datum=Difficulty.apply(id,'standard');
 window.COURT_DATA=s.datum;window.LOCAL_TRACK=id;
 window.CourtScene=s.scene||FNFTrackMenu.tracks['01'].scene;window.FnfUI=s.ui||FNFTrackMenu.tracks['01'].ui;
 baseScrollSpeed=s.datum?.config.scrollSpeed||870;
 data=s.datum;records=trackRecords(id);syncSlot(s);CourtSounds.selectMusic(audio);audio.volume=settings.music;
 if(data&&s.ui)s.ui.configure({chart:data.chart,config:{...data.config,downscroll:settings.downscroll,scrollSpeed:renderScrollSpeed()}});
 if(ready){engine=new FnfJudge(data.chart,data.config,{autoplay:false,practice:false,ghostTapping:false});lastState=engine.sample(0);}
 updateBest();showPreparation();updateControls();void restoreCachedTrack();
 return true;
};
let debugTime=null,exportEngine=null,exportView=false,currentPoses={joucho:'idle_A',sekai:'idle_A'},runtimeError=null;
let sessionToken=0,feedbackCursor=0,countStart=0,countFrozen=null,countStep=-1,pauseFrom='playing',pauseReason='';
let countdownKind='opening',countFrameTime=0,countAudioTime=0,countLastWall=0,goStart=null;
let failedStart=0,retryStart=0,failLoopStarted=false,failurePaused=false,bindingLane=null,menuPage='home',audioWaiting=false;
let lastMusicTime=0,lastMusicProgress=0,lastPaintWall=0,playbackBeganAt=0;
let calibrationToken=0,calibrationStatus='idle',calibrationPulse=null,calibrationTest=null,calibrationResult=null,calibrationCollecting=false;
const now=()=>performance.now()/1000,beat=()=>60/(data?.chart.bpm||128),preRoll=()=>3*beat();
const laneOf=code=>hasOwn(ARROWS,code)?ARROWS[code]:settings.keys.indexOf(code);
const touchLanes=new Map();
const downInLane=lane=>[...physical].some(code=>laneOf(code)===lane)||[...touchLanes.values()].includes(lane);
const songClock=()=>debugTime===null?audio.currentTime-settings.offsetMs/1000:debugTime;
const judgementTime=(raw=songClock())=>Math.max(debugTime===null&&engine?engine.time:0,Math.min(data.chart.duration,Number.isFinite(raw)?raw:engine?.time||0));
const countdownClock=()=>countFrozen===null?now()-countStart-preRoll():countFrozen;
const keyLabel=code=>code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ');
function persist(){try{const previous=JSON.parse(localStorage.getItem(STORE)||'{}')||{};previous.settings=settings;previous.recordsByDifficulty={...previous.recordsByDifficulty,[TRACK]:{...previous.recordsByDifficulty?.[TRACK],...records}};localStorage.setItem(STORE,JSON.stringify(previous));}catch{}}
function overlay(name){for(const id of ['menu','pause','result','gameover','settings','calibration'])$(id+'-overlay').hidden=id!==name;}
function setExport(value){exportView=value;document.body.classList.toggle('export-view',value);performanceDisplay.setExport(value);}
function clearPhysical(){physical.clear();touchLanes.clear();document.querySelectorAll('[data-lane]').forEach(b=>b.classList.remove('down'));}
let frameRequest=0;
function scheduleFrame(){
 const running=phase==='countdown'||phase==='playing'||phase==='failed'||phase==='retrying'||
  (phase==='calibrating'&&calibrationStatus==='running');
 if(!frameRequest&&running)frameRequest=requestAnimationFrame(loop);
}
function updateControls(){
 scheduleFrame();
 document.body.dataset.phase=phase;const active=['playing','paused','countdown','starting'].includes(phase);
 $('pause').disabled=!active;$('pause').setAttribute('aria-label',phase==='paused'?'继续演奏':'暂停');
 $('restart').disabled=!ready||['loading','menu','settings'].includes(phase);
 $('freeplay').disabled=phase!=='menu';$('start').disabled=phase!=='menu'||!ready;for(const b of document.querySelectorAll('[data-difficulty]'))b.disabled=phase!=='menu'||!ready;
 document.querySelectorAll('[data-lane]').forEach(b=>b.disabled=!canHoldKeys()||autoplay);
 $('gameover-retry').disabled=phase==='retrying';$('gameover-menu').disabled=phase==='retrying';
 performanceDisplay.setPhase(phase);
}
function canHoldKeys(){return ['playing','paused'].includes(phase)||(['countdown','starting'].includes(phase)&&countdownKind==='resume');}
function menuSound(name){CourtSounds.play(name,{volume:.65});}
const releaseDialog=$('release-note'), releaseOpen=$('release-open');
const releaseKey='fnf-release-note', releaseVersion=releaseDialog.dataset.release;
const reduceReleaseMotion=matchMedia('(prefers-reduced-motion: reduce)');
const releaseOpenMs=350, releaseCloseMs=250;
const releaseFlags=new Set();
let releaseMotion=null, accountReleasePending=false;
function hasReleaseFlag(key){
 if(releaseFlags.has(key))return true;
 for(const storage of ['localStorage','sessionStorage']){
  try{if(window[storage].getItem(key)===releaseVersion)return true;}catch{}
 }
 return false;
}
function setReleaseFlag(key){
 releaseFlags.add(key);
 for(const storage of ['localStorage','sessionStorage']){
  try{window[storage].setItem(key,releaseVersion);return;}catch{}
 }
}
function startReleaseMotion(closing=false){
 const origin=releaseOpen.getBoundingClientRect(), panel=releaseDialog.getBoundingClientRect();
 const dx=origin.left+origin.width/2-panel.left-panel.width/2;
 const dy=origin.top+origin.height/2-panel.top-panel.height/2;
 const sx=releaseOpen.offsetWidth/releaseDialog.offsetWidth, sy=releaseOpen.offsetHeight/releaseDialog.offsetHeight;
 const centered='translate(-50%,-50%) rotate(var(--note-orientation,0deg))';
 const small=origin.width&&origin.height
  ? `translate(${dx}px,${dy}px) ${centered} rotate(-2deg) scale(${sx},${sy})`
  : `translate(0,0) ${centered} rotate(0deg) scale(.96)`;
 const frames=[
  {transform:small,opacity:.65},
  {transform:`translate(0,0) ${centered} rotate(0deg) scale(1,1)`,opacity:1}
 ];
 releaseMotion=releaseDialog.animate(closing?frames.reverse():frames,{
  duration:closing?releaseCloseMs:releaseOpenMs,easing:'cubic-bezier(.2,0,0,1)',fill:'both'
 });
 releaseMotion.onfinish=()=>{
  if(releaseDialog.hasAttribute('data-closing'))releaseDialog.close();
  releaseMotion.cancel();releaseMotion=null;
 };
}
function openRelease(manual){
 if(releaseDialog.open)return;
 releaseDialog.removeAttribute('data-closing');
 releaseDialog.showModal();
 setReleaseFlag(releaseKey);
 if(!reduceReleaseMotion.matches&&releaseDialog.animate)startReleaseMotion();
 if(manual||CourtSounds.canPlayImmediately||navigator.userActivation?.isActive)
  CourtSounds.play('confirmMenu',{volume:.65,channel:'release-note'});
}
function closeRelease(event){
 event.preventDefault();
 if(!releaseDialog.open||releaseDialog.hasAttribute('data-closing'))return;
 releaseDialog.setAttribute('data-closing','');
 CourtSounds.play('cancelMenu',{volume:.65,channel:'release-note'});
 if(reduceReleaseMotion.matches||!releaseDialog.animate){
  if(releaseMotion){releaseMotion.cancel();releaseMotion=null;}
  releaseDialog.close();return;
 }
 if(!releaseMotion){startReleaseMotion(true);return;}
 releaseMotion.playbackRate=-releaseOpenMs/releaseCloseMs;
 releaseMotion.play();
}
function showUnreadRelease(withSound=false){
 const present=()=>{
  if(phase!=='menu'||$('rank-dialog').open)return;
  if(!accountReleasePending&&hasReleaseFlag(releaseKey)){if(withSound)menuSound('cancelMenu');return;}
  accountReleasePending=false;openRelease(false);
 };
 if(navigator.locks)void navigator.locks.request(releaseKey,present).catch(present);
 else present();
}
// Credit the anonymous viewing on this browser to the first account that signs in.
window.addEventListener('account-release-receipt',event=>{
 const assignedKey=releaseKey+'-assigned';
 const inherit=hasReleaseFlag(releaseKey)&&!hasReleaseFlag(assignedKey);
 if(event.detail.first&&!inherit){
  if(phase==='menu'||phase==='finished')openRelease(false);
  else accountReleasePending=true;
 }else setReleaseFlag(releaseKey);
 setReleaseFlag(assignedKey);
});
releaseOpen.onclick=()=>openRelease(true);
releaseDialog.querySelector('form').addEventListener('submit',closeRelease);
releaseDialog.addEventListener('cancel',closeRelease);
releaseDialog.addEventListener('close',()=>{
 if(phase==='menu'&&menuPage==='home')releaseOpen.focus({preventScroll:true});
});
function showMenuPage(view,withSound=true){
 pendingMode=null;menuPage=view;$('menu-overlay').dataset.view=view;
 for(const name of ['home','song'])$(name+'-screen').hidden=name!==view;
 if(view==='song'){
  const art=document.querySelector('.court-print img');if(art&&!art.hasAttribute('src'))art.src=art.dataset.src;
  void restoreCachedTrack();
 }
 showPreparation();$(view==='song'?'track'+TRACK:'freeplay').focus({preventScroll:true});if(view==='song'){window.refreshTrackList?.();$('track'+TRACK).scrollIntoView({block:'nearest'});}
 if(view==='home')showUnreadRelease(withSound);
 else if(withSound)menuSound('confirmMenu');
}
function updateBest(){
 const r=records[Difficulty.id],el=$('best-score');el.hidden=false;
 el.textContent=r?`本地最佳 · ${Difficulty.label} ${r.score.toLocaleString('zh-CN')} · 准确率 ${r.accuracy.toFixed(2)}%`:`本地最佳 · ${Difficulty.label} 暂无成绩`;
}
function chooseDifficulty(mode){
 if(phase!=='menu'||menuPage!=='song'||!ready||!Object.hasOwn(Difficulty.tiers,mode)||mode===Difficulty.id)return;
 menuSound('confirmMenu');data=Difficulty.apply(TRACK,mode);window.COURT_DATA=data;activeSlot.datum=data;
 records=trackRecords(TRACK);exportEngine=null;debugTime=null;setExport(false);
 FnfUI.configure({chart:data.chart,config:{...data.config,downscroll:settings.downscroll,scrollSpeed:renderScrollSpeed()}});
 engine=new FnfJudge(data.chart,data.config,{practice:false,autoplay:false,ghostTapping:false});
 lastState=engine.sample(0);updateBest();paint(0,lastState);
}
for(const button of document.querySelectorAll('[data-difficulty]'))button.onclick=()=>chooseDifficulty(button.dataset.difficulty);
function failureAudioEnabled(){return settings.failureSound==='on'||(settings.failureSound==='mode'&&!practice);}
function applySettings(){document.body.dataset.scroll=settings.downscroll?'down':'up';audio.volume=settings.music;CourtSounds.setVolume(settings.sfx);FnfUI.configure({config:{downscroll:settings.downscroll,scrollSpeed:renderScrollSpeed()}});performanceDisplay.configure(settings.quality,settings.performanceMonitor);if(!failureAudioEnabled())for(const channel of ['failure-miss','death','gameover','retry'])CourtSounds.stop(channel);persist();}
function settingsForm(){
 $('downscroll').checked=settings.downscroll;$('scroll-direction').textContent=settings.downscroll?'下落式':'上升式';
 $('quality').value=settings.quality;$('performance-monitor').checked=settings.performanceMonitor;
 $('music-volume').value=Math.round(settings.music*100);$('music-value').value=Math.round(settings.music*100)+'%';
 $('sfx-volume').value=Math.round(settings.sfx*100);$('sfx-value').value=Math.round(settings.sfx*100)+'%';
 $('failure-sound').value=settings.failureSound;$('offset').value=settings.offsetMs;$('offset-value').value=(settings.offsetMs>0?'+':'')+settings.offsetMs+' 毫秒';
 $('scroll-speed').value=Math.round(settings.scrollMultiplier*100);$('scroll-speed-value').value=settings.scrollMultiplier.toFixed(2)+'×';
 document.querySelectorAll('[data-bind]').forEach(b=>{b.textContent=keyLabel(settings.keys[Number(b.dataset.bind)]);b.classList.toggle('binding',Number(b.dataset.bind)===bindingLane);});
}
function drawCountdown(t){
 if(t < -preRoll()-.001||t>=.34)return null;
 let image,key,age;
 if(t < -2*beat()){key='num3';age=t+preRoll();}
 else if(t < -beat()){key='ready';age=t+2*beat();}
 else if(t<0){key='set';age=t+beat();}
 else{key='go';age=t;}
 image=FnfUI.getExtraImage(key);if(!image)return null;
 const scale=key==='num3'?2.1:.95;
 const pop=1+.08*Math.exp(-Math.max(0,age)*22);ctx.save();ctx.scale(canvas.width/1920,canvas.height/1080);
 ctx.globalAlpha=key==='go'?Math.max(0,1-age/.34):1;
 ctx.drawImage(image,960-image.width*scale*pop/2,475-image.height*scale*pop/2,image.width*scale*pop,image.height*scale*pop);ctx.restore();
 return {key,age};
}
function paint(t,state,judge=engine,forcedCountdown=null){
 const idle=CourtScene.idle(t);
 function pose(side){const action=judge?judge.activePose(side,Math.max(0,t)):'idle';return action==='idle'?idle:action;}
 currentPoses={joucho:pose(0),sekai:pose(1)};
 const miss=state.lastMiss?.[1];
 if(miss&&t>=miss.at&&t-miss.at<.30){
  const feedback=state.feedbackEvents;let recent=null;
  for(let i=feedback.length-1;i>=0;i--)if(feedback[i].side===1&&feedback[i].type==='hit'){recent=feedback[i];break;}
  if(!recent||recent.seq<miss.seq)currentPoses.sekai='miss';
 }
 CourtScene.transport?.(t,phase==='playing'&&debugTime===null&&judge!==exportEngine&&!audio.paused&&!audio.seeking&&!audioWaiting);
 CourtScene.draw(ctx,t,currentPoses,state);const ui=FnfUI.draw(ctx,Math.max(0,t),data.chart.events,state,canvas.width,canvas.height,true);
 const countdownTime=forcedCountdown!==null?forcedCountdown:judge===exportEngine?t:phase==='countdown'&&countdownKind==='opening'?t:phase==='playing'&&goStart!==null?now()-goStart:null;
 return {ui,countdown:countdownTime===null?null:drawCountdown(countdownTime)};
}
function consumeFeedback(state){
 const events=state.feedbackEvents||[];
 let first=events.length;
 while(first>0&&events[first-1].seq>feedbackCursor)first--;
 for(let i=first;i<events.length;i++){const e=events[i];feedbackCursor=e.seq;
  if(e.side!==1||state.time-e.at>.20||state.time<e.at||phase!=='playing')continue;
  if(['miss','ghost','drop'].includes(e.type)&&failureAudioEnabled())CourtSounds.play('missnote'+(1+e.seq%3),{volume:.50,channel:'failure-miss'});
 }
}
function resetMusicWatch(){
 lastMusicTime=songClock();lastMusicProgress=lastPaintWall=playbackBeganAt=performance.now();audioWaiting=false;visualClock.reset();
}
function pauseAtCheckpoint(){
 const restore=Math.max(0,Math.min(audio.duration,engine.time+settings.offsetMs/1000));
 pause('浏览器画面或音乐位置中断，已恢复到上次判定位置。点击继续演奏。',restore);
 return false;
}
function endSong(){
 if(phase!=='playing'||debugTime!==null)return;
 if(performance.now()-lastPaintWall>750&&songClock()-engine.time>.35){pauseAtCheckpoint();return;}
 if(audio.currentTime<data.chart.duration-.25){
  pause('乐曲提前停止，已暂停计分。点击继续演奏恢复。');return;
 }
 lastState=engine.sample(data.chart.duration);finish(lastState);
}
function musicAdvancing(raw=songClock()){
 if(debugTime!==null)return true;
 if(phase!=='playing')return false;
 const wall=performance.now();
 if(Number.isFinite(raw)&&(raw<lastMusicTime-.25||
    (wall-lastPaintWall>750&&raw-engine.time>.35)||
    (raw-lastMusicTime>.75&&wall-lastMusicProgress<250))){
  return pauseAtCheckpoint();
 }
 if(audio.ended){endSong();return false;}
 if(audio.paused||audio.interrupted||audioWaiting||audio.seeking||!Number.isFinite(raw)){
  pause('音乐播放已中断，计分已暂停。点击继续演奏恢复。');return false;
 }
 if(raw>lastMusicTime+.0001){lastMusicTime=raw;lastMusicProgress=wall;}
 if(wall-playbackBeganAt>650&&wall-lastMusicProgress>(audio.mode==='web-audio'?250:350)){
  pause('音乐进度未更新，计分已暂停。点击继续演奏恢复。');return false;
 }
 return true;
}
// Checking a completed CacheStorage entry does not start a network download.
async function restoreCachedTrack(){
 const slot=activeSlot;
 if(slot.ready||slot.preparation||slot.cacheChecked)return;
 slot.cacheChecked=true;
 try{
  const cached=await slot.audio.readCached();
  if(!cached||slot.ready||slot.preparation)return;
  if(slot===activeSlot&&phase==='menu'&&menuPage==='song')void prepareAssets(cached);
  else slot.cacheChecked=false;
 }catch{}
}
function showPreparation(){
 const visible=phase==='menu'&&menuPage==='song'&&!ready&&!!(preparation||preparationError);
 const dl=$('download-start'),hadFocus=dl===document.activeElement||$('retry')===document.activeElement;
 dl.hidden=ready||visible;
 dl.disabled=phase!=='menu'||!!preparation||ready;
 $('play-modes').hidden=!ready;
 if(ready&&hadFocus&&menuPage==='song')$('start').focus({preventScroll:true});
 const parts=Object.values(prepGroups),done=parts.filter(Boolean).length;
 $('load-strip').hidden=!visible;
 const total=audio.downloadTotal||Number(audio.element.dataset.bytes)||0;
 const received=prepGroups.audio?total:Math.max(0,Math.min(total,audio.downloadReceived||0));
 const percent=total>0?Math.floor(received*100/total):0;
 $('download-size').textContent=total>0?(total/1000000).toFixed(2)+' MB':'';
 const meter=$('asset-progress'),status=$('load-status');
 const preparing=total>0&&received===total&&!ready;
 if(preparing||preparationError)meter.removeAttribute('value');else meter.value=percent;
 $('load-phase').textContent=preparationError?'歌曲载入':preparing?'乐曲准备':'歌曲下载';
 $('load-percent').textContent=preparationError?'未完成':preparing?'准备中':percent+'%';
 if(preparationError)status.textContent=preparationError;
 else if(preparing){
  const pending=!prepGroups.audio?'正在解码音乐':!prepGroups.chart?'正在载入谱面':
   !prepGroups.scene||!prepGroups.ui?'正在载入舞台和界面':!prepGroups.effects?'正在准备音效':'即将就绪';
  status.textContent=`音频已下载 · ${pending}`;
 }else{
  const bytes=total>0?`${(received/1000000).toFixed(2)} / ${(total/1000000).toFixed(2)} MB`:'音乐准备中';
  status.textContent=`${bytes} · 资源 ${done}/${parts.length}`;
 }
 status.classList.toggle('error',!!preparationError);
 $('retry').hidden=!visible||!preparationError;
}
function trackPreparation(slot,name,promise){
 return Promise.resolve(promise).then(value=>{
  slot.groups[name]=true;if(slot===activeSlot){syncSlot(slot);showPreparation();}return value;
 });
}
function prepareAssets(cachedBytes){
 const slot=activeSlot;
 if(slot.ready)return Promise.resolve(true);
 if(slot.preparation)return slot.preparation;
 slot.error='';slot.groups=groups();
 slot.audio.downloadProgress=null;slot.audio.downloadReceived=0;
 slot.preparation=Promise.resolve().then(async()=>{
  const player=slot.audio;
  const art=FNFTrackMenu.loadScene(slot.id).then(async track=>{
   slot.datum=Difficulty.dataFor(slot.id,'standard');slot.scene=track.scene;slot.ui=track.ui;
   await Promise.all([trackPreparation(slot,'ui',slot.ui.load('assets/ui/')),trackPreparation(slot,'scene',slot.scene.load('assets/'))]);
  });
  const soundsReady=CourtSounds.warmup(['intro3','intro2','intro1','introGo','missnote1','missnote2','missnote3']);
  await Promise.all([art,trackPreparation(slot,'chart',FNFTrackMenu.loadEasy(slot.id)),trackPreparation(slot,'audio',player.prepare(cachedBytes)),trackPreparation(slot,'effects',soundsReady)]);
  const {datum,ui,scene}=slot;
  if(!Number.isFinite(player.duration)||player.duration<datum.chart.duration-.25)throw new Error('乐曲文件未完整载入');
  scene.configure(datum.chart);void CourtSounds.warmup(['fnf_loss_sfx','gameOver','gameOverEnd']);void ui.warmSplashes();
  slot.ready=true;slot.runtimeError=null;
  if(slot===activeSlot){
   data=window.COURT_DATA=datum;window.CourtScene=scene;window.FnfUI=ui;
   ui.configure({chart:datum.chart,config:{...datum.config,downscroll:settings.downscroll,scrollSpeed:renderScrollSpeed()}});
   engine=new FnfJudge(data.chart,data.config,{autoplay:false,practice:false,ghostTapping:false});
   lastState=engine.sample(0);paint(0,lastState);syncSlot(slot);updateBest();
  }
  return true;
 }).catch(e=>{slot.runtimeError=String(e.message||e);slot.error='部分画面或音乐没有载入，请重试。';slot.ready=false;return false;})
 .finally(()=>{slot.preparation=null;if(slot===activeSlot){syncSlot(slot);showPreparation();updateControls();}});
 syncSlot(slot);showPreparation();return slot.preparation;
}
function start(auto=false,repeat=false,practiceChoice=false){
 if(!ready)return;sessionToken++;audio.pause();audio.currentTime=0;CourtSounds.stop();debugTime=null;setExport(false);clearPhysical();
 void CourtSounds.unlock();resetMusicWatch();performanceDisplay.resetRound();
 void FnfUI.warmSplashes();
 if(!repeat){autoplay=!!auto;practice=!auto&&!!practiceChoice;}
 window.RankLocal?.begin(TRACK,Difficulty.id==='standard'&&!practice&&!autoplay&&!testMode);
 highestCombo=0;feedbackCursor=0;engine.reset({autoplay,practice,ghostTapping:false});
 lastState=engine.sample(0);phase='countdown';countdownKind='opening';countStart=countLastWall=now();countFrozen=null;countStep=0;goStart=null;failLoopStarted=false;failurePaused=false;
 overlay(null);updateControls();performanceDisplay.fit();paint(-preRoll(),lastState);CourtSounds.play('intro3',{volume:.85});canvas.focus({preventScroll:true});
}
async function beginSong(){
 if(phase!=='countdown')return;const token=sessionToken,resuming=countdownKind==='resume';
 if(resuming&&requiredHolds().length){restoreResumePause('长音尚未按住，乐曲仍然暂停。');return;}
 if(resuming)settleResumeKeys();
 phase='starting';updateControls();
 try{
  if(!resuming||debugTime===null)await audio.play();
  if(token!==sessionToken||phase!=='starting'){if(!['playing','starting'].includes(phase))audio.pause();return;}
  if(resuming&&requiredHolds().length){restoreResumePause('长音尚未按住，乐曲仍然暂停。');return;}
  if(resuming)settleResumeKeys();
  resetMusicWatch();phase='playing';countFrozen=null;goStart=now();CourtSounds.play('introGo',{volume:.85});updateControls();canvas.focus({preventScroll:true});
 }catch(e){
  if(token!==sessionToken)return;
  if(resuming){restoreResumePause('乐曲未能播放，请再点击一次继续。');return;}
  audio.pause();CourtSounds.stop();phase='paused';pauseFrom='playing';pauseReason='点击继续，允许浏览器播放乐曲。';overlay('pause');updatePauseHint();updateControls();
 }
}
// Neither a paused round nor its continuation countdown may advance scoring.
// The judge's held notes stay intact; physical keys can be restored separately.
function requiredHolds(){if(!engine||autoplay)return[];const s=engine.sample(engine.time);return s.laneStates[1].map((lane,i)=>lane.held&&!downInLane(i)?i:-1).filter(i=>i>=0);}
function settleResumeKeys(){if(autoplay)return;const s=engine.sample(engine.time);for(let lane=0;lane<4;lane++)if(s.laneStates[1][lane].pressed&&!s.laneStates[1][lane].held&&!downInLane(lane)){window.RankLocal?.record(engine.time,lane,0);engine.release(lane,engine.time);}lastState=engine.sample(engine.time);}
function restoreResumePause(reason){
 audio.pause();if(debugTime===null&&Math.abs(audio.currentTime-countAudioTime)>.0001)audio.currentTime=countAudioTime;
 CourtSounds.stop();lastState=engine.sample(engine.time);phase='paused';pauseFrom='playing';pauseReason=reason;countFrozen=null;goStart=null;
 overlay('pause');updatePauseHint();updateControls();
}
function updatePauseHint(){const missing=requiredHolds(),reason=pauseReason||'歌曲与判定已暂停。';$('pause-hint').textContent=missing.length?`${reason} 重新按住 ${missing.map(i=>['←','↓','↑','→'][i]).join('、')} 后继续。`:reason;}
function pause(reason='歌曲与判定已暂停。',restoreTime=null){
 if(!['playing','countdown','starting'].includes(phase))return;const previous=phase;sessionToken++;setExport(false);audio.pause();CourtSounds.pauseAll();
 if(countdownKind==='resume'&&['countdown','starting'].includes(previous)){restoreResumePause(reason);return;}
 if(Number.isFinite(restoreTime))audio.currentTime=restoreTime;
 pauseFrom=previous==='countdown'?'countdown':'playing';if(pauseFrom==='countdown')countFrozen=countdownClock();
 lastState=engine.sample(judgementTime());highestCombo=Math.max(highestCombo,lastState.combo[1]);
 if(lastState.failed||lastState.finished){finish(lastState);return;}phase='paused';pauseReason=reason;goStart=null;overlay('pause');updatePauseHint();updateControls();
}
function resume(){
 if(phase!=='paused'||!ready)return;if(requiredHolds().length){updatePauseHint();return;}setExport(false);
 void CourtSounds.unlock();sessionToken++;
 if(pauseFrom==='countdown'&&countdownKind==='opening'){countStart=now()-(countFrozen+preRoll());countLastWall=now();countFrozen=null;phase='countdown';CourtSounds.resumeAll();overlay(null);updateControls();canvas.focus({preventScroll:true});return;}
 // Start the same three-beat presentation as the opening, over the frozen
 // position of this round, rather than rewinding the chart or playing music.
 countdownKind='resume';countAudioTime=audio.currentTime;countFrameTime=engine.time;lastState=engine.sample(engine.time);
 CourtSounds.stop();phase='countdown';countStart=countLastWall=now();countFrozen=null;countStep=0;goStart=null;
 overlay(null);updateControls();performanceDisplay.fit();paint(countFrameTime,lastState,engine,-preRoll());CourtSounds.play('intro3',{volume:.85});canvas.focus({preventScroll:true});
}
function menu(){
 window.RankLocal?.abandon();
 sessionToken++;audio.pause();audio.currentTime=0;CourtSounds.stop();debugTime=null;setExport(false);clearPhysical();bindingLane=null;
 if(!ready)return;phase='menu';countFrozen=null;goStart=null;engine.reset({autoplay:false,practice:false,ghostTapping:false});feedbackCursor=0;highestCombo=0;lastState=engine.sample(0);paint(0,lastState);overlay('menu');updateBest();updateControls();showMenuPage('song',false);
}
function finish(state){
 if(['failed','retrying','finished'].includes(phase))return;audio.pause();lastState=state;highestCombo=Math.max(highestCombo,state.combo[1]);clearPhysical();
 if(state.failed&&!practice&&!autoplay){phase='failed';failedStart=now();failLoopStarted=false;CourtSounds.stop();if(failureAudioEnabled())CourtSounds.play('fnf_loss_sfx',{volume:.9,channel:'death'});CourtScene.drawGameOver(ctx,0,{phase:'enter'});overlay('gameover');updateControls();return;}
 phase='finished';CourtSounds.stop();$('result-kicker').textContent=autoplay?'演示结果':Difficulty.label+'成绩';
 const rating=CourtTiming.grade(state.accuracy[1],state.misses[1],autoplay);
 $('result-title').textContent=rating.title;$('result-grade-caption').textContent=rating.caption;document.querySelector('.result-sheet').dataset.grade=rating.key;
 $('result-score').textContent=state.scores[1].toLocaleString('zh-CN');$('result-accuracy').textContent=state.accuracy[1].toFixed(2)+'%';$('result-combo').textContent=highestCombo;$('result-misses').textContent=state.misses[1];
 let best=false;if(!autoplay){const mode=Difficulty.id,old=records[mode];if(!old||state.scores[1]>old.score){best=true;records[mode]={score:state.scores[1],accuracy:state.accuracy[1],combo:highestCombo,misses:state.misses[1]};persist();}}
 $('new-record').textContent=autoplay?'':[best?'本地新纪录':'',state.misses[1]===0?'全连击':''].filter(Boolean).join(' · ');window.RankLocal?.finish(Difficulty.id==='standard'&&!autoplay&&!practice&&!testMode&&!state.failed,{score:state.scores[1],accuracy:state.accuracy[1],combo:highestCombo,misses:state.misses[1]});overlay('result');updateControls();$('again').focus({preventScroll:true});
}
function retryFailure(){if(phase!=='failed')return;sessionToken++;phase='retrying';retryStart=now();CourtSounds.stop();if(failureAudioEnabled())CourtSounds.play('gameOverEnd',{volume:.85,channel:'retry'});updateControls();}
// Input is scored synchronously; real gameplay presents the result in the next
// animation frame instead of redrawing the entire canvas for each pointer event.
function input(lane){if(phase!=='playing'||autoplay||!musicAdvancing())return;const t=judgementTime();window.RankLocal?.record(t,lane,1);const r=engine.press(lane,t);lastState=engine.sampleFrame(t);highestCombo=Math.max(highestCombo,lastState.combo[1]);consumeFeedback(lastState);if(debugTime!==null)paint(songClock(),lastState);if(lastState.failed)finish(lastState);return r;}
function release(lane){if(phase==='playing'&&!autoplay&&!downInLane(lane)&&musicAdvancing()){const t=judgementTime();window.RankLocal?.record(t,lane,0);engine.release(lane,t);lastState=engine.sampleFrame(t);consumeFeedback(lastState);if(debugTime!==null)paint(songClock(),lastState);if(lastState.failed)finish(lastState);}}
function openSettings(){if(phase!=='menu')return;menuSound('confirmMenu');phase='settings';bindingLane=null;settingsForm();overlay('settings');showSettingsTab('sound');updateControls();$('tab-sound').focus({preventScroll:true});}
function showSettingsTab(name){
 bindingLane=null;$('key-status').textContent='';settingsForm();
 for(const key of settingTabs){
  const active=key===name,tab=$('tab-'+key);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('panel-'+key).hidden=!active;
 }
}
for(const name of settingTabs){
 const tab=$('tab-'+name);
 tab.onclick=()=>showSettingsTab(name);
 tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const i=settingTabs.indexOf(name),delta=e.key==='ArrowLeft'?-1:1;const next=e.key==='Home'?settingTabs[0]:e.key==='End'?settingTabs[settingTabs.length-1]:settingTabs[(i+delta+settingTabs.length)%settingTabs.length];showSettingsTab(next);$('tab-'+next).focus();};
}
function closeSettings(){if(phase!=='settings')return;bindingLane=null;applySettings();phase='menu';overlay('menu');updateControls();menuSound('cancelMenu');$('settings-open').focus({preventScroll:true});}

// The calibration panel is independent of any round. Taps are only compared
// with its scheduled audio beats; they never enter the judge or play a hit FX.
function offsetLabel(ms){return (ms>0?'+':'')+ms+' 毫秒';}
function stopCalibration(){calibrationToken++;if(calibrationPulse)calibrationPulse.stop();calibrationPulse=null;}
function updateCalibrationCount(){const count=calibrationTest?.count||0;$('calibration-progress').value=count;$('calibration-count').value=`${count} / 12 拍`;}
function calibrationView(status,message){
 calibrationStatus=status;if(status==='running')scheduleFrame();
 $('calibration-status').textContent=message;updateCalibrationCount();
 const running=status==='running',preparing=status==='preparing';
 $('calibration-tap').hidden=!running;$('calibration-tap').disabled=!running;
 $('calibration-start').hidden=running;$('calibration-start').disabled=preparing;
 $('calibration-start').firstChild.nodeValue=status==='idle'?'开始测试 ':preparing?'正在准备 ':'重新测试 ';
 $('calibration-apply').hidden=!(status==='result'&&calibrationResult?.ok);
}
function openCalibration(){
 if(phase!=='settings')return;stopCalibration();bindingLane=null;clearPhysical();calibrationTest=null;calibrationResult=null;calibrationCollecting=false;
 phase='calibrating';overlay('calibration');updateControls();calibrationView('idle','准备好后开始，按听到的节拍跟拍。');$('calibration-start').focus({preventScroll:true});
}
function closeCalibration(){
 if(phase!=='calibrating')return;stopCalibration();calibrationTest=null;calibrationResult=null;clearPhysical();
 phase='settings';overlay('settings');showSettingsTab('control');updateControls();$('calibration-open').focus({preventScroll:true});
}
async function beginCalibration(){
 if(phase!=='calibrating'||['preparing','running'].includes(calibrationStatus))return;
 stopCalibration();const token=calibrationToken;CourtSounds.stop();calibrationTest=new CourtTiming.TapCalibration();calibrationResult=null;calibrationCollecting=false;
 calibrationView('preparing','正在准备校准节拍…');
 try{
  const pulse=await CourtSounds.startTimingPulse(CourtTiming.beatSeconds,CourtTiming.totalBeats);
  if(token!==calibrationToken||phase!=='calibrating'){pulse.stop();return;}
  calibrationPulse=pulse;calibrationView('running','先听四拍预备节拍。之后跟着声音点击。');$('calibration-tap').focus({preventScroll:true});
 }catch{
  if(token!==calibrationToken||phase!=='calibrating')return;
  calibrationView('unavailable','当前浏览器未能播放校准节拍。可重新测试，或返回设置手动调整偏移。');$('calibration-start').focus({preventScroll:true});
 }
}
function interruptCalibration(){
 if(phase!=='calibrating'||!['preparing','running'].includes(calibrationStatus))return;
 stopCalibration();calibrationTest=null;calibrationResult=null;calibrationView('interrupted','测试已中断，请留在当前页面重新测试。');
}
function calibrationTap(){
 if(phase==='calibrating'&&calibrationStatus==='running'&&calibrationPulse?.running&&calibrationTest.tap(calibrationPulse.elapsed()))updateCalibrationCount();
}
function tickCalibration(){
 if(calibrationStatus!=='running'||!calibrationPulse)return;
 if(!calibrationPulse.running){interruptCalibration();return;}
 const elapsed=calibrationPulse.elapsed();
 if(!calibrationCollecting&&elapsed>=CourtTiming.warmupBeats*CourtTiming.beatSeconds-.25){calibrationCollecting=true;$('calibration-status').textContent='现在跟随听到的每一拍，按空格或点按跟拍区。';}
 if(elapsed<CourtTiming.endSeconds)return;
 stopCalibration();calibrationResult=calibrationTest.result();const r=calibrationResult;
 calibrationView('result',r.ok?`建议偏移 ${offsetLabel(r.offsetMs)}（${r.count}/12 拍有效）。请选择应用偏移，或重新测试。`:r.reason==='few'?'有效跟拍太少，未改变设置。请重新测试。':'节拍偏差不够稳定，未改变设置。请重新测试，或手动调整。');
 $(r.ok?'calibration-apply':'calibration-start').focus({preventScroll:true});
}
function applyCalibration(){if(phase!=='calibrating'||!calibrationResult?.ok)return;settings.offsetMs=calibrationResult.offsetMs;applySettings();closeCalibration();}
function toggleFullscreen(){window.PlayScreen.toggle();}
function visibleButtons(){const target=phase==='menu'?'menu':phase==='paused'?'pause':phase==='failed'?'gameover':phase==='finished'?'result':phase==='settings'?'settings':null;return target?[...$(target+'-overlay').querySelectorAll('button:not([disabled])')].filter(b=>!b.hidden&&b.offsetParent!==null):[];}
window.addEventListener('keydown',e=>{
 if(releaseDialog.open||document.getElementById('rank-dialog')?.open)return;
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;const code=e.code;
 if(phase==='calibrating'){
  if(code==='Escape'){e.preventDefault();if(!e.repeat)closeCalibration();return;}
  if(calibrationStatus==='running'&&(code==='Space'||(code==='Enter'&&document.activeElement===$('calibration-tap')))){e.preventDefault();if(!e.repeat)calibrationTap();return;}
  return;
 }
 if(bindingLane!==null){e.preventDefault();if(e.repeat)return;if(code==='Escape'){bindingLane=null;settingsForm();return;}
  if(!/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||code==='KeyR'){$('key-status').textContent='请使用字母或数字键；R保留为快捷键。';return;}
  if(settings.keys.some((k,i)=>k===code&&i!==bindingLane)){$('key-status').textContent='这个键已分配给另一个方向，请换一个。';return;}
  settings.keys[bindingLane]=code;bindingLane=null;$('key-status').textContent='键位已保存；方向键始终可用。';settingsForm();applySettings();return;
 }
 if(['menu','paused','failed','finished','settings'].includes(phase)){
  if(phase==='settings'&&['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){
   if(code==='Escape'){e.preventDefault();closeSettings();}return;
  }
  if(['ArrowDown','ArrowUp'].includes(code)&&!(phase==='paused'&&requiredHolds().length)&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){
   e.preventDefault();if(e.repeat)return;const buttons=visibleButtons(),i=buttons.indexOf(document.activeElement),delta=code==='ArrowDown'?1:-1;if(buttons.length)buttons[(i+delta+buttons.length)%buttons.length].focus({preventScroll:true});menuSound('scrollMenu');return;
  }
  if(code==='Enter'&&!['INPUT','BUTTON'].includes(document.activeElement?.tagName)){e.preventDefault();if(e.repeat)return;if(phase==='paused')resume();else if(phase==='failed')retryFailure();else if(phase==='finished')start(autoplay,true);else if(phase==='menu'){if(menuPage==='song')startPerformance(false);else showMenuPage('song');}return;}
  if(code==='Escape'){e.preventDefault();if(phase==='settings')closeSettings();else if(phase==='paused')resume();else if(['failed','finished'].includes(phase))menu();else if(phase==='menu'&&menuPage!=='home')showMenuPage('home');return;}
 }
 const lane=laneOf(code);
 if(lane>=0){if(!['playing','paused','countdown','starting'].includes(phase))return;e.preventDefault();if(e.repeat||physical.has(code))return;const wasDown=downInLane(lane);physical.add(code);if(phase==='paused')updatePauseHint();else if(!wasDown)input(lane);}
 else if(code==='Space'&&['playing','paused','countdown','starting'].includes(phase)){e.preventDefault();if(!e.repeat){if(phase==='paused')resume();else pause();}}
 else if(code==='KeyR'&&['playing','paused','countdown','starting','failed','finished'].includes(phase)){e.preventDefault();if(!e.repeat){if(phase==='failed')retryFailure();else start(autoplay,true);}}
 else if(code==='Escape'&&['playing','countdown','starting'].includes(phase)){e.preventDefault();pause();}
 else if(code==='KeyF'&&laneOf(code)<0&&!e.repeat){e.preventDefault();toggleFullscreen();}
});
window.addEventListener('keyup',e=>{if(document.getElementById('rank-dialog')?.open)return;const lane=laneOf(e.code);if(lane<0)return;if(['playing','paused'].includes(phase))e.preventDefault();physical.delete(e.code);if(phase==='paused')updatePauseHint();else release(lane);});
function lostFocus(){if(['playing','countdown','starting'].includes(phase))pause('已切换窗口。');if(phase==='calibrating')interruptCalibration();if(phase==='failed'){failurePaused=true;CourtSounds.pauseAll();}clearPhysical();if(phase==='paused')updatePauseHint();}
window.addEventListener('blur',lostFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)lostFocus();else if(failurePaused&&phase==='failed'){failurePaused=false;CourtSounds.resumeAll();}});window.addEventListener('focus',()=>{if(failurePaused&&phase==='failed'){failurePaused=false;CourtSounds.resumeAll();}});
function liftTouch(e){
 const lane=touchLanes.get(e.pointerId);
 if(lane===undefined)return;
 touchLanes.delete(e.pointerId);
 if(![...touchLanes.values()].includes(lane))document.querySelector('[data-lane="'+lane+'"]')?.classList.remove('down');
 if(phase==='paused')updatePauseHint();else release(lane);
}
document.querySelectorAll('[data-lane]').forEach(button=>{
 const lane=Number(button.dataset.lane);
 button.addEventListener('pointerdown',e=>{
  if(button.disabled||autoplay||!canHoldKeys()||touchLanes.has(e.pointerId)||(e.pointerType==='mouse'&&e.button!==0))return;
  e.preventDefault();const wasDown=downInLane(lane);touchLanes.set(e.pointerId,lane);
  try{button.setPointerCapture?.(e.pointerId);}catch{}button.classList.add('down');
  if(phase==='paused')updatePauseHint();else if(!wasDown)input(lane);
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,liftTouch);
});
// Some mobile browsers decline pointer capture. A release outside the pad
// must still lift the original lane rather than leave a held key behind.
window.addEventListener('pointerup',liftTouch);
window.addEventListener('pointercancel',liftTouch);
function startPerformance(asPractice){
 if(phase!=='menu'||menuPage!=='song'||!ready)return;
 void CourtSounds.unlock();
 window.PlayScreen.enterFromGesture();
 if(ready){pendingMode=null;start(false,false,asPractice);return;}
 pendingMode=asPractice;
 void prepareAssets().then(ok=>{
  if(!ok||pendingMode===null||phase!=='menu'||menuPage!=='song')return;
  const choice=pendingMode;pendingMode=null;start(false,false,choice);
 });
}
$('download-start').onclick=()=>{if(phase==='menu'&&menuPage==='song'&&!ready){void CourtSounds.unlock();void prepareAssets();}};
$('start').onclick=()=>startPerformance(false);
$('freeplay').onclick=()=>showMenuPage('song');$('song-back').onclick=()=>showMenuPage('home');
$('pause').onclick=()=>phase==='paused'?resume():pause();$('resume').onclick=resume;$('restart').onclick=$('again').onclick=()=>start(autoplay,true);
$('pause-menu').onclick=$('result-menu').onclick=$('gameover-menu').onclick=menu;$('gameover-retry').onclick=retryFailure;$('fullscreen').onclick=toggleFullscreen;
$('settings-open').onclick=openSettings;$('settings-close').onclick=closeSettings;$('settings-reset').onclick=()=>{settings={...DEFAULTS,keys:[...DEFAULTS.keys]};bindingLane=null;applySettings();settingsForm();};
$('settings-done').onclick=closeSettings;
$('downscroll').onchange=()=>{settings.downscroll=$('downscroll').checked;applySettings();settingsForm();};
$('quality').onchange=()=>{settings.quality=CourtPerformance.qualities.includes($('quality').value)?$('quality').value:'auto';applySettings();};
$('performance-monitor').onchange=()=>{settings.performanceMonitor=$('performance-monitor').checked;applySettings();};
for(const [id,name]of [['music-volume','music'],['sfx-volume','sfx']])$(id).oninput=()=>{settings[name]=Number($(id).value)/100;applySettings();settingsForm();};
$('offset').oninput=()=>{settings.offsetMs=Number($('offset').value);applySettings();settingsForm();};
$('scroll-speed').oninput=()=>{settings.scrollMultiplier=Number($('scroll-speed').value)/100;applySettings();settingsForm();};
$('calibration-open').onclick=openCalibration;$('calibration-back').onclick=closeCalibration;$('calibration-start').onclick=beginCalibration;$('calibration-apply').onclick=applyCalibration;
$('calibration-tap').addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;e.preventDefault();calibrationTap();});
$('calibration-tap').onclick=e=>{if(e.detail===0)calibrationTap();};
$('failure-sound').onchange=()=>{settings.failureSound=['mode','off','on'].includes($('failure-sound').value)?$('failure-sound').value:'mode';applySettings();};
document.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{bindingLane=Number(b.dataset.bind);settingsForm();$('key-status').textContent='请按新的字母或数字键，Esc取消。';});
$('retry').onclick=()=>pendingMode===null?prepareAssets():startPerformance(pendingMode);for(const b of document.querySelectorAll('.overlay button'))b.addEventListener('click',()=>{if(!b.classList.contains('track-card')&&!b.id.startsWith('calibration-')&&!['release-open','song-back','start','practice-start','gameover-retry','settings-open','settings-close','freeplay','song-back','resume','restart','again'].includes(b.id))menuSound(['pause-menu','result-menu','gameover-menu'].includes(b.id)?'cancelMenu':'confirmMenu');});
function loop(frameTime){
 frameRequest=0;
 const live=debugTime===null,measuring=performanceDisplay.wantsSample(phase,live);
 const started=measuring?performance.now():0;
 let painted=false,raw=null;
 try{
  if(phase==='calibrating')tickCalibration();
  if(ready&&!exportView){
   if(phase==='countdown'){
     const wall=now(),t=countdownClock();
     if(countdownKind==='resume'&&wall-countLastWall>.75){pause('倒数时画面中断，点击继续重新倒数。');}
     else{
      countLastWall=wall;
      if(t>=0)beginSong();
      else{
       const step=Math.min(2,Math.floor((t+preRoll())/beat()));
       if(step>countStep){countStep=step;CourtSounds.play(step===1?'intro2':'intro1',{volume:.85});}
       performanceDisplay.fit();
       if(countdownKind==='resume')paint(countFrameTime,lastState,engine,t);else paint(t,lastState);
       painted=true;
      }
     }
   }else if(phase==='playing'){
    raw=songClock();
    if(musicAdvancing(raw)){
     lastState=engine.sampleFrame(judgementTime(raw));
     highestCombo=Math.max(highestCombo,lastState.combo[1]);consumeFeedback(lastState);
     const advancing=live&&!audio.paused&&!audio.seeking&&!audioWaiting&&audio.readyState>=3;
     const viewTime=live&&audio.mode==='native'?visualClock.sample(raw,frameTime,advancing):raw;
     performanceDisplay.fit();paint(viewTime,lastState);painted=true;lastPaintWall=performance.now();
     if(lastState.failed||lastState.finished)finish(lastState);
    }
   }else if(phase==='failed'){
    const age=now()-failedStart;CourtScene.drawGameOver(ctx,age,{phase:age<1.25?'enter':'loop'});
    if(age>=1.25&&!failLoopStarted&&!failurePaused){if(failureAudioEnabled())CourtSounds.play('gameOver',{volume:.72,loop:true,channel:'gameover'});failLoopStarted=true;}
   }else if(phase==='retrying'){
    const age=now()-retryStart;CourtScene.drawGameOver(ctx,now()-failedStart,{phase:'retry',retryAge:age});if(age>=1.4)start(false,true);
   }
  }
 }catch(e){runtimeError=String(e.message||e);if(['playing','countdown','starting'].includes(phase))pause('演奏暂时中断，请重开后再试。');else if(phase==='calibrating')interruptCalibration();console.error(e);}
 finally{
  try{if(measuring)performanceDisplay.record(frameTime,performance.now()-started,painted,raw,phase,live,audio.mode);}
  finally{scheduleFrame();}
 }
}
if(testMode){window.CourtGame={debug:{
 setTime(t){if(!ready||!Number.isFinite(t)||t<0||t>data.chart.duration)throw new RangeError('Test time outside chart');audio.pause();debugTime=t;setExport(false);if(engine.time>t){engine.reset({autoplay,practice,ghostTapping:false});clearPhysical();highestCombo=0;}
  lastState=engine.sample(t);highestCombo=Math.max(highestCombo,lastState.combo[1]);feedbackCursor=lastState.feedbackSeq;performanceDisplay.fit();paint(t,lastState);if(lastState.failed||lastState.finished)finish(lastState);return this.getSnapshot();},
 getSnapshot(){const state=engine?engine.sample(phase==='playing'?judgementTime():engine.time):null;return{ready,phase,menuPage,difficulty:Difficulty.id,revision:data?.chart?.revision,autoplay,practice,time:ready?songClock():0,audioTime:audio.currentTime,audioPaused:audio.paused,highestCombo,poses:{...currentPoses},physicalKeys:[...physical,...[...new Set(touchLanes.values())].map(lane=>'pointer'+lane)],settings:{...settings,keys:[...settings.keys]},scrollSpeed:renderScrollSpeed(),records:JSON.parse(JSON.stringify(records)),countdownTime:phase==='countdown'?countdownClock():null,countdownKind:['countdown','starting'].includes(phase)?countdownKind:null,calibration:{status:calibrationStatus,elapsed:calibrationPulse?.elapsed()??null,count:calibrationTest?.count||0,result:calibrationResult},error:runtimeError,sound:CourtSounds.snapshot(),...(state?{...state,noteStates:Object.fromEntries(state.noteStates)}:{})};},
 startAuto(){start(true,false,false);},
 renderAt(t,options={autoplay:true}){if(!ready||!Number.isFinite(t)||t < -preRoll()-.00001||t>data.chart.duration)throw new RangeError('Export time outside chart');if(!exportEngine)exportEngine=new FnfJudge(data.chart,data.config,{autoplay:true,practice:true,ghostTapping:false});exportEngine.reset({autoplay:options.autoplay!==false,practice:true,ghostTapping:false});const state=exportEngine.sample(Math.max(0,t));setExport(true);const sessionPoses=currentPoses,detail=paint(t,state,exportEngine),poses={...currentPoses};currentPoses=sessionPoses;return{...state,time:t,noteStates:Object.fromEntries(state.noteStates),poses,...detail};},
 renderGameOverAt(elapsed,options={phase:'loop'}){if(!ready)throw new Error('Not ready');setExport(true);return CourtScene.drawGameOver(ctx,elapsed,options);}
}};}
CourtSounds.load(window.FNF_EXTRA_ASSETS,'assets/extra/');
applySettings();settingsForm();updateBest();overlay('menu');updateControls();showPreparation();if(new URLSearchParams(location.search).get('view')==='select')showMenuPage('song',false);showUnreadRelease();
})();
