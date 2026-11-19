(function(){
'use strict';
const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d',{alpha:false}),audio=CourtSounds.createMusic($('music'));
const testMode=new URLSearchParams(location.search).get('test')==='1'&&
 (location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname));
const performanceDisplay=CourtPerformance.create(canvas,$('viewport'),$('performance-panel'));
const visualClock=new CourtPerformance.VisualClock();
const settingTabs=['sound','control','display'];
const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const ARROWS={ArrowLeft:0,ArrowDown:1,ArrowUp:2,ArrowRight:3},physical=new Set();
const DEFAULTS={music:.85,sfx:.45,hitSound:false,failureSound:'mode',offsetMs:0,downscroll:false,quality:'auto',performanceMonitor:false,keys:['KeyA','KeyS','KeyW','KeyD']};
const STORE='rhythm-court26';let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{}
if(!saved||typeof saved!=='object')saved={};
let settings={...DEFAULTS},records={};
for(const key of Object.keys(DEFAULTS))if(saved.settings&&hasOwn(saved.settings,key))settings[key]=saved.settings[key];
const playerNotes=COURT_DATA.chart.events.filter(note=>note.side===1);
const sustainStep=COURT_DATA.config.sustainStep||.1171875;
const highestPossibleScore=playerNotes.reduce((total,note)=>total+350+Math.ceil(note.hold/sustainStep)*10,0);
for(const mode of ['practice','formal']){
 const record=saved.records?.[mode];
 if(record&&Number.isSafeInteger(record.score)&&record.score>=-10000000&&record.score<=highestPossibleScore&&
    Number.isFinite(record.accuracy)&&record.accuracy>=0&&record.accuracy<=100&&
    Number.isSafeInteger(record.combo)&&record.combo>=0&&record.combo<=playerNotes.length&&
    Number.isSafeInteger(record.misses)&&record.misses>=0&&record.misses<=1000000){
  records[mode]={score:record.score,accuracy:record.accuracy,combo:record.combo,misses:record.misses};
 }
}
settings.downscroll=settings.downscroll===true;
settings.performanceMonitor=settings.performanceMonitor===true;
settings.hitSound=settings.hitSound===true;
settings.quality=CourtPerformance.qualities.includes(settings.quality)?settings.quality:'auto';
settings.keys=Array.isArray(settings.keys)&&settings.keys.length===4&&new Set(settings.keys).size===4&&settings.keys.every(key=>typeof key==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(key)&&!['KeyR','KeyF'].includes(key))?settings.keys:[...DEFAULTS.keys];
function settingNumber(value,fallback,min,max){
 const number=typeof value==='number'||typeof value==='string'?Number(value):NaN;
 return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
}
for(const name of ['music','sfx'])settings[name]=settingNumber(settings[name],DEFAULTS[name],0,1);
settings.offsetMs=settingNumber(settings.offsetMs,DEFAULTS.offsetMs,-200,200);
settings.failureSound=['mode','off','on'].includes(settings.failureSound)?settings.failureSound:'mode';
let data,engine,ready=false,phase='menu',autoplay=false,practice=false,lastState=null,highestCombo=0;
let preparation=null,preparationError='',pendingMode=null;
let debugTime=null,exportEngine=null,exportView=false,currentPoses={joucho:'idle_A',sekai:'idle_A'},runtimeError=null;
let sessionToken=0,feedbackCursor=0,countStart=0,countFrozen=null,countStep=-1,pauseFrom='playing',pauseReason='';
let failedStart=0,retryStart=0,failLoopStarted=false,failurePaused=false,bindingLane=null,menuPage='home',audioWaiting=false;
let lastMusicTime=0,lastMusicProgress=0,lastPaintWall=0,playbackBeganAt=0;
const now=()=>performance.now()/1000,beat=()=>60/(data?.chart.bpm||128),preRoll=()=>3*beat();
const laneOf=code=>hasOwn(ARROWS,code)?ARROWS[code]:settings.keys.indexOf(code);
const touchLanes=new Map();
const downInLane=lane=>[...physical].some(code=>laneOf(code)===lane)||[...touchLanes.values()].includes(lane);
const songClock=()=>debugTime===null?audio.currentTime-settings.offsetMs/1000:debugTime;
const judgementTime=(raw=songClock())=>Math.max(debugTime===null&&engine?engine.time:0,Math.min(data.chart.duration,Number.isFinite(raw)?raw:engine?.time||0));
const countdownClock=()=>countFrozen===null?now()-countStart-preRoll():countFrozen;
const keyLabel=code=>code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ');
function persist(){try{localStorage.setItem(STORE,JSON.stringify({settings,records}));}catch{}}
function overlay(name){for(const id of ['menu','pause','result','gameover','settings'])$(id+'-overlay').hidden=id!==name;}
function setExport(value){exportView=value;document.body.classList.toggle('export-view',value);performanceDisplay.setExport(value);}
function clearPhysical(){physical.clear();touchLanes.clear();document.querySelectorAll('[data-lane]').forEach(b=>b.classList.remove('down'));}
function updateControls(){
 document.body.dataset.phase=phase;const active=['playing','paused','countdown','starting'].includes(phase);
 $('pause').disabled=!active;$('pause').setAttribute('aria-label',phase==='paused'?'继续演奏':'暂停');
 $('restart').disabled=!ready||['loading','menu','settings'].includes(phase);
 for(const id of ['start','practice-start','freeplay'])$(id).disabled=phase!=='menu';
 document.querySelectorAll('[data-lane]').forEach(b=>b.disabled=!['playing','paused'].includes(phase)||autoplay);
 $('gameover-retry').disabled=phase==='retrying';$('gameover-menu').disabled=phase==='retrying';
 performanceDisplay.setPhase(phase);
}
function menuSound(name){CourtSounds.play(name,{volume:.65});}
function showMenuPage(view,withSound=true){
 pendingMode=null;menuPage=view;$('menu-overlay').dataset.view=view;
 for(const name of ['home','song'])$(name+'-screen').hidden=name!==view;
 if(withSound)menuSound(view==='home'?'cancelMenu':'confirmMenu');
 if(view==='song'){
  const art=document.querySelector('.court-print img');if(art&&!art.hasAttribute('src'))art.src=art.dataset.src;
  void prepareAssets();
 }
 showPreparation();$(view==='song'?'practice-start':'freeplay').focus({preventScroll:true});
}
function updateBest(){const r=records.formal,el=$('best-score');el.hidden=!r;el.textContent=r?`本地正式最佳 ${r.score.toLocaleString('zh-CN')} · 准确率 ${r.accuracy.toFixed(2)}%`:'';}
function failureAudioEnabled(){return settings.failureSound==='on'||(settings.failureSound==='mode'&&!practice);}
function applySettings(){audio.volume=settings.music;CourtSounds.setVolume(settings.sfx);FnfUI.configure({config:{downscroll:settings.downscroll}});performanceDisplay.configure(settings.quality,settings.performanceMonitor);if(!failureAudioEnabled())for(const channel of ['failure-miss','death','gameover','retry'])CourtSounds.stop(channel);persist();}
function settingsForm(){
 $('downscroll').checked=settings.downscroll;$('scroll-direction').textContent=settings.downscroll?'下落式':'上升式';
 $('quality').value=settings.quality;$('performance-monitor').checked=settings.performanceMonitor;
 $('music-volume').value=Math.round(settings.music*100);$('music-value').value=Math.round(settings.music*100)+'%';
 $('sfx-volume').value=Math.round(settings.sfx*100);$('sfx-value').value=Math.round(settings.sfx*100)+'%';
 $('hit-sound').checked=!!settings.hitSound;$('failure-sound').value=settings.failureSound;$('offset').value=settings.offsetMs;$('offset-value').value=(settings.offsetMs>0?'+':'')+settings.offsetMs+' 毫秒';
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
function paint(t,state,judge=engine){
 const idle=CourtScene.idle(t),pose=role=>{const action=judge?judge.activePose(role,Math.max(0,t)):'idle';return action==='idle'?idle:action;};
 currentPoses={joucho:pose('joucho'),sekai:pose('sekai')};
 const miss=state?.lastMiss?.[1],feedback=state?.feedbackEvents||[];
 let recent=null;
 for(let i=feedback.length-1;i>=0;i--)if(feedback[i].side===1&&feedback[i].type==='hit'){recent=feedback[i];break;}
 if(miss&&t>=miss.at&&t-miss.at<.30&&(!recent||recent.seq<miss.seq))currentPoses.sekai='miss';
 CourtScene.draw(ctx,t,currentPoses);const ui=FnfUI.draw(ctx,Math.max(0,t),data.chart.events,state,canvas.width,canvas.height,true);
 return {ui,countdown:(judge===exportEngine||['countdown','starting','playing'].includes(phase))?drawCountdown(t):null};
}
function consumeFeedback(state){
 const events=state.feedbackEvents||[];
 let first=events.length;
 while(first>0&&events[first-1].seq>feedbackCursor)first--;
 for(let i=first;i<events.length;i++){const e=events[i];feedbackCursor=e.seq;
  if(e.side!==1||state.time-e.at>.20||state.time<e.at||phase!=='playing')continue;
  if(e.type==='hit'&&settings.hitSound)CourtSounds.play('hitsound',{volume:.24});
  else if(['miss','ghost','drop'].includes(e.type)&&failureAudioEnabled())CourtSounds.play('missnote'+(1+e.seq%3),{volume:.50,channel:'failure-miss'});
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
function showPreparation(){
 const visible=phase==='menu'&&menuPage==='song';
 const progress=audio.downloadProgress;
 const waiting=progress===null?'正在准备舞台和乐曲…':progress<100?`正在载入乐曲 ${progress}%…`:'音乐已载入，正在准备演奏…';
 const status=$('load-status'),message=preparationError||(preparation?waiting:'');
 status.textContent=message;status.hidden=!visible||!message;status.classList.toggle('error',!!preparationError);
 $('retry').hidden=!visible||!preparationError;
}
function prepareAssets(){
 if(ready)return Promise.resolve(true);
 if(preparation)return preparation;
 preparationError='';
 preparation=Promise.resolve().then(async()=>{
  data=window.COURT_DATA;
  if(!data||!window.CourtScene||!window.FnfUI||!window.FnfJudge)throw new Error('游戏文件不完整');
  FnfUI.configure({chart:data.chart,config:{...data.config,downscroll:settings.downscroll}});
  const soundsReady=CourtSounds.warmup(['intro3','intro2','intro1','introGo','hitsound','missnote1','missnote2','missnote3']);
  await Promise.all([FnfUI.load('assets/ui/'),CourtScene.load('assets/'),audio.prepare(),soundsReady]);
  if(!Number.isFinite(audio.duration)||audio.duration<data.chart.duration-.25)throw new Error('乐曲文件未完整载入');
  void CourtSounds.warmup(['fnf_loss_sfx','gameOver','gameOverEnd']);
  void FnfUI.warmSplashes();
  engine=new FnfJudge(data.chart,data.config,{autoplay:false,practice:false,ghostTapping:false});
  lastState=engine.sample(0);paint(0,lastState);ready=true;runtimeError=null;updateBest();
  return true;
 }).catch(e=>{runtimeError=String(e.message||e);preparationError='部分画面或音乐没有载入，请重试。';return false;})
 .finally(()=>{preparation=null;showPreparation();updateControls();});
 showPreparation();return preparation;
}
function start(auto=false,repeat=false,practiceChoice=false){
 if(!ready)return;sessionToken++;audio.pause();audio.currentTime=0;CourtSounds.stop();debugTime=null;setExport(false);clearPhysical();
 void CourtSounds.unlock();resetMusicWatch();performanceDisplay.resetRound();
 void FnfUI.warmSplashes();
 if(!repeat){autoplay=!!auto;practice=!auto&&!!practiceChoice;}
 highestCombo=0;feedbackCursor=0;engine=new FnfJudge(data.chart,data.config,{autoplay,practice,ghostTapping:false});
 lastState=engine.sample(0);phase='countdown';countStart=now();countFrozen=null;countStep=0;failLoopStarted=false;failurePaused=false;
 overlay(null);updateControls();performanceDisplay.fit();paint(-preRoll(),lastState);CourtSounds.play('intro3',{volume:.85});canvas.focus({preventScroll:true});
}
async function beginSong(){
 if(phase!=='countdown')return;const token=sessionToken;phase='starting';updateControls();CourtSounds.play('introGo',{volume:.85});
 try{await audio.play();if(token!==sessionToken||phase!=='starting'){if(!['playing','starting'].includes(phase))audio.pause();return;}
  resetMusicWatch();phase='playing';countFrozen=null;updateControls();canvas.focus({preventScroll:true});
 }catch(e){if(token!==sessionToken)return;audio.pause();CourtSounds.stop();phase='paused';pauseFrom='playing';pauseReason='点击继续，允许浏览器播放乐曲。';overlay('pause');updatePauseHint();updateControls();}
}
function requiredHolds(){if(!engine||autoplay||pauseFrom==='countdown')return[];const s=engine.sample(judgementTime());return s.laneStates[1].map((lane,i)=>lane.held&&!downInLane(i)?i:-1).filter(i=>i>=0);}
function updatePauseHint(){const missing=requiredHolds(),reason=pauseReason||'歌曲与判定已暂停。';$('pause-hint').textContent=missing.length?`${reason} 重新按住 ${missing.map(i=>['←','↓','↑','→'][i]).join('、')} 后继续。`:reason;}
function pause(reason='歌曲与判定已暂停。',restoreTime=null){
 if(!['playing','countdown','starting'].includes(phase))return;const previous=phase;sessionToken++;setExport(false);audio.pause();CourtSounds.pauseAll();
 if(Number.isFinite(restoreTime))audio.currentTime=restoreTime;
 pauseFrom=previous==='countdown'?'countdown':'playing';if(pauseFrom==='countdown')countFrozen=countdownClock();
 lastState=engine.sample(judgementTime());highestCombo=Math.max(highestCombo,lastState.combo[1]);
 if(lastState.failed||lastState.finished){finish(lastState);return;}phase='paused';pauseReason=reason;overlay('pause');updatePauseHint();updateControls();
}
async function resume(){
 if(phase!=='paused'||!ready)return;if(requiredHolds().length){updatePauseHint();return;}setExport(false);
 void CourtSounds.unlock();
 const token=++sessionToken;
 if(pauseFrom==='countdown'){countStart=now()-(countFrozen+preRoll());countFrozen=null;phase='countdown';CourtSounds.resumeAll();overlay(null);updateControls();canvas.focus({preventScroll:true});return;}
 if(!autoplay){const s=engine.sample(judgementTime());for(let lane=0;lane<4;lane++)if(s.laneStates[1][lane].pressed&&!s.laneStates[1][lane].held&&!downInLane(lane))engine.release(lane,judgementTime());}
 try{if(debugTime===null)await audio.play();if(token!==sessionToken||phase!=='paused'){if(!['playing','starting'].includes(phase))audio.pause();return;}
  resetMusicWatch();phase='playing';CourtSounds.resumeAll();overlay(null);updateControls();canvas.focus({preventScroll:true});
 }catch{if(token!==sessionToken)return;pauseReason='乐曲未能播放，请再点击一次继续。';updatePauseHint();}
}
function menu(){
 sessionToken++;audio.pause();audio.currentTime=0;CourtSounds.stop();debugTime=null;setExport(false);clearPhysical();bindingLane=null;
 if(!ready)return;phase='menu';countFrozen=null;engine.reset({autoplay:false,practice:false,ghostTapping:false});feedbackCursor=0;highestCombo=0;lastState=engine.sample(0);paint(0,lastState);overlay('menu');updateBest();updateControls();showMenuPage('song',false);
}
function finish(state){
 if(['failed','retrying','finished'].includes(phase))return;audio.pause();lastState=state;highestCombo=Math.max(highestCombo,state.combo[1]);clearPhysical();
 if(state.failed&&!practice&&!autoplay){phase='failed';failedStart=now();failLoopStarted=false;CourtSounds.stop();if(failureAudioEnabled())CourtSounds.play('fnf_loss_sfx',{volume:.9,channel:'death'});CourtScene.drawGameOver(ctx,0,{phase:'enter'});overlay('gameover');updateControls();return;}
 phase='finished';CourtSounds.stop();$('result-kicker').textContent=autoplay?'演示结果':practice?'练习成绩':'正式成绩';
 $('result-title').textContent=autoplay?'自动演示结束':'演奏完成';
 $('result-score').textContent=state.scores[1].toLocaleString('zh-CN');$('result-accuracy').textContent=state.accuracy[1].toFixed(2)+'%';$('result-combo').textContent=highestCombo;$('result-misses').textContent=state.misses[1];
 let best=false;if(!autoplay){const mode=practice?'practice':'formal',old=records[mode];if(!old||state.scores[1]>old.score){best=true;records[mode]={score:state.scores[1],accuracy:state.accuracy[1],combo:highestCombo,misses:state.misses[1]};persist();}}
 $('new-record').textContent=autoplay?'':best?'本地新纪录':state.misses[1]===0?'全连击':'';overlay('result');updateControls();$('again').focus({preventScroll:true});
}
function retryFailure(){if(phase!=='failed')return;sessionToken++;phase='retrying';retryStart=now();CourtSounds.stop();if(failureAudioEnabled())CourtSounds.play('gameOverEnd',{volume:.85,channel:'retry'});updateControls();}
// Input is scored synchronously; real gameplay presents the result in the next
// animation frame instead of redrawing the entire canvas for each pointer event.
function input(lane){if(phase!=='playing'||autoplay||!musicAdvancing())return;const t=judgementTime(),r=engine.press(lane,t);lastState=engine.sampleFrame(t);highestCombo=Math.max(highestCombo,lastState.combo[1]);consumeFeedback(lastState);if(debugTime!==null)paint(songClock(),lastState);if(lastState.failed)finish(lastState);return r;}
function release(lane){if(phase==='playing'&&!autoplay&&!downInLane(lane)&&musicAdvancing()){const t=judgementTime();engine.release(lane,t);lastState=engine.sampleFrame(t);consumeFeedback(lastState);if(debugTime!==null)paint(songClock(),lastState);if(lastState.failed)finish(lastState);}}
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
function toggleFullscreen(){window.PlayScreen.toggle();}
function visibleButtons(){const target=phase==='menu'?'menu':phase==='paused'?'pause':phase==='failed'?'gameover':phase==='finished'?'result':phase==='settings'?'settings':null;return target?[...$(target+'-overlay').querySelectorAll('button:not([disabled])')].filter(b=>!b.hidden&&b.offsetParent!==null):[];}
window.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;const code=e.code;
 if(bindingLane!==null){e.preventDefault();if(e.repeat)return;if(code==='Escape'){bindingLane=null;settingsForm();return;}
  if(!/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||['KeyR','KeyF'].includes(code)){$('key-status').textContent='请使用字母或数字键；R和F保留为快捷键。';return;}
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
  if(code==='Enter'&&!['INPUT','BUTTON'].includes(document.activeElement?.tagName)){e.preventDefault();if(e.repeat)return;if(phase==='paused')resume();else if(phase==='failed')retryFailure();else if(phase==='finished')start(autoplay,true);else if(phase==='menu'){if(menuPage==='song')startPerformance(true);else showMenuPage('song');}return;}
  if(code==='Escape'){e.preventDefault();if(phase==='settings')closeSettings();else if(phase==='paused')resume();else if(['failed','finished'].includes(phase))menu();else if(phase==='menu'&&menuPage!=='home')showMenuPage('home');return;}
 }
 const lane=laneOf(code);
 if(lane>=0){if(!['playing','paused','countdown','starting'].includes(phase))return;e.preventDefault();if(e.repeat||physical.has(code))return;const wasDown=downInLane(lane);physical.add(code);if(phase==='paused')updatePauseHint();else if(!wasDown)input(lane);}
 else if(code==='Space'&&['playing','paused','countdown'].includes(phase)){e.preventDefault();if(!e.repeat){if(phase==='paused')resume();else pause();}}
 else if(code==='KeyR'&&['playing','paused','countdown','failed','finished'].includes(phase)){e.preventDefault();if(!e.repeat){if(phase==='failed')retryFailure();else start(autoplay,true);}}
 else if(code==='Escape'&&['playing','countdown'].includes(phase)){e.preventDefault();pause();}
 else if(code==='KeyF'&&!e.repeat){e.preventDefault();toggleFullscreen();}
});
window.addEventListener('keyup',e=>{const lane=laneOf(e.code);if(lane<0)return;if(['playing','paused'].includes(phase))e.preventDefault();physical.delete(e.code);if(phase==='paused')updatePauseHint();else release(lane);});
function lostFocus(){if(['playing','countdown','starting'].includes(phase))pause('已切换窗口。');if(phase==='failed'){failurePaused=true;CourtSounds.pauseAll();}clearPhysical();if(phase==='paused')updatePauseHint();}
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
  if(button.disabled||autoplay||!['playing','paused'].includes(phase)||touchLanes.has(e.pointerId)||(e.pointerType==='mouse'&&e.button!==0))return;
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
 if(phase!=='menu'||menuPage!=='song')return;
 void CourtSounds.unlock();
 window.PlayScreen.enterFromGesture();
 if(ready){pendingMode=null;start(false,false,asPractice);return;}
 pendingMode=asPractice;
 void prepareAssets().then(ok=>{
  if(!ok||pendingMode===null||phase!=='menu'||menuPage!=='song')return;
  const choice=pendingMode;pendingMode=null;start(false,false,choice);
 });
}
$('practice-start').onclick=()=>startPerformance(true);$('start').onclick=()=>startPerformance(false);
$('freeplay').onclick=()=>showMenuPage('song');$('song-back').onclick=()=>showMenuPage('home');
$('pause').onclick=()=>phase==='paused'?resume():pause();$('resume').onclick=resume;$('restart').onclick=$('again').onclick=()=>start(autoplay,true);
$('pause-menu').onclick=$('result-menu').onclick=$('gameover-menu').onclick=menu;$('gameover-retry').onclick=retryFailure;$('fullscreen').onclick=toggleFullscreen;
$('settings-open').onclick=openSettings;$('settings-close').onclick=closeSettings;$('settings-reset').onclick=()=>{settings={...DEFAULTS,keys:[...DEFAULTS.keys]};bindingLane=null;applySettings();settingsForm();};
$('settings-done').onclick=closeSettings;
$('downscroll').onchange=()=>{settings.downscroll=$('downscroll').checked;applySettings();settingsForm();};
$('quality').onchange=()=>{settings.quality=CourtPerformance.qualities.includes($('quality').value)?$('quality').value:'auto';applySettings();};
$('performance-monitor').onchange=()=>{settings.performanceMonitor=$('performance-monitor').checked;applySettings();};
for(const [id,name]of [['music-volume','music'],['sfx-volume','sfx']])$(id).oninput=()=>{settings[name]=Number($(id).value)/100;applySettings();settingsForm();};
$('hit-sound').onchange=()=>{settings.hitSound=$('hit-sound').checked;applySettings();};$('offset').oninput=()=>{settings.offsetMs=Number($('offset').value);applySettings();settingsForm();};
$('failure-sound').onchange=()=>{settings.failureSound=['mode','off','on'].includes($('failure-sound').value)?$('failure-sound').value:'mode';applySettings();};
document.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{bindingLane=Number(b.dataset.bind);settingsForm();$('key-status').textContent='请按新的字母或数字键，Esc取消。';});
$('retry').onclick=()=>pendingMode===null?prepareAssets():startPerformance(pendingMode);for(const b of document.querySelectorAll('.overlay button'))b.addEventListener('click',()=>{if(!['start','practice-start','gameover-retry','settings-open','settings-close','freeplay','song-back'].includes(b.id))menuSound(['pause-menu','result-menu','gameover-menu'].includes(b.id)?'cancelMenu':'confirmMenu');});
audio.addEventListener('progress',showPreparation);
audio.addEventListener('ended',endSong);audio.addEventListener('error',()=>{if(phase==='playing'&&debugTime===null)pause('乐曲读取中断，计分已暂停。点击继续演奏恢复。');});
for(const event of ['waiting','seeking','pause','ended'])audio.addEventListener(event,()=>{if(event==='waiting')audioWaiting=true;visualClock.reset();});
audio.addEventListener('playing',()=>{audioWaiting=false;visualClock.reset();});
function loop(frameTime){
 const live=debugTime===null,measuring=performanceDisplay.wantsSample(phase,live);
 const started=measuring?performance.now():0;
 let painted=false,raw=null;
 try{
  if(ready&&!exportView){
   if(phase==='countdown'){
    const t=countdownClock();
    if(t>=0)beginSong();
    else{
     const step=Math.min(2,Math.floor((t+preRoll())/beat()));
     if(step>countStep){countStep=step;CourtSounds.play(step===1?'intro2':'intro1',{volume:.85});}
     performanceDisplay.fit();paint(t,lastState);painted=true;
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
 }catch(e){runtimeError=String(e.message||e);if(['playing','countdown','starting'].includes(phase))pause('演奏暂时中断，请重开后再试。');console.error(e);}
 finally{
  try{if(measuring)performanceDisplay.record(frameTime,performance.now()-started,painted,raw,phase,live,audio.mode);}
  finally{requestAnimationFrame(loop);}
 }
}
if(testMode){window.CourtGame={debug:{
 setTime(t){if(!ready||!Number.isFinite(t)||t<0||t>data.chart.duration)throw new RangeError('Test time outside chart');audio.pause();debugTime=t;setExport(false);if(engine.time>t){engine.reset({autoplay,practice,ghostTapping:false});clearPhysical();highestCombo=0;}
  lastState=engine.sample(t);highestCombo=Math.max(highestCombo,lastState.combo[1]);feedbackCursor=lastState.feedbackSeq;performanceDisplay.fit();paint(t,lastState);if(lastState.failed||lastState.finished)finish(lastState);return this.getSnapshot();},
 getSnapshot(){const state=engine?engine.sample(judgementTime()):null;return{ready,phase,menuPage,autoplay,practice,time:ready?songClock():0,audioTime:audio.currentTime,audioPaused:audio.paused,highestCombo,poses:{...currentPoses},physicalKeys:[...physical,...[...new Set(touchLanes.values())].map(lane=>'pointer'+lane)],settings:{...settings,keys:[...settings.keys]},records:JSON.parse(JSON.stringify(records)),countdownTime:phase==='countdown'?countdownClock():null,error:runtimeError,sound:CourtSounds.snapshot(),...(state?{...state,noteStates:Object.fromEntries(state.noteStates)}:{})};},
 startAuto(){start(true,false,false);},
 renderAt(t,options={autoplay:true}){if(!ready||!Number.isFinite(t)||t < -preRoll()-.00001||t>data.chart.duration)throw new RangeError('Export time outside chart');if(!exportEngine)exportEngine=new FnfJudge(data.chart,data.config,{autoplay:true,practice:true,ghostTapping:false});exportEngine.reset({autoplay:options.autoplay!==false,practice:true,ghostTapping:false});const state=exportEngine.sample(Math.max(0,t));setExport(true);const sessionPoses=currentPoses,detail=paint(t,state,exportEngine),poses={...currentPoses};currentPoses=sessionPoses;return{...state,time:t,noteStates:Object.fromEntries(state.noteStates),poses,...detail};},
 renderGameOverAt(elapsed,options={phase:'loop'}){if(!ready)throw new Error('Not ready');setExport(true);return CourtScene.drawGameOver(ctx,elapsed,options);}
}};}
CourtSounds.load(window.FNF_EXTRA_ASSETS,'assets/extra/');
applySettings();settingsForm();updateBest();overlay('menu');updateControls();showPreparation();requestAnimationFrame(loop);
})();
