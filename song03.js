(function(root){
'use strict';const track=root.FNFTrackMenu.tracks['03'];
track.installScene=function(){
const M=root.SONG03_DATA,oldUI=root.FNFTrackMenu.tracks['01'].ui,W=1920,H=1080,DIR=['left','down','up','right'],R=M.roots,A=M.atlas;
const revisedSprites={"moving_0":[2,2,132,132],"receptor_0":[2,140,132,132],"held_0":[2,278,132,132],"confirm_0":[2,416,132,132],"body_0":[2,553,42,90],"cap_0":[2,648,42,21],"moving_1":[140,2,132,132],"receptor_1":[140,140,132,132],"held_1":[140,278,132,132],"confirm_1":[140,416,132,132],"body_1":[140,553,42,90],"cap_1":[140,648,42,21],"moving_2":[278,2,132,132],"receptor_2":[278,140,132,132],"held_2":[278,278,132,132],"confirm_2":[278,416,132,132],"body_2":[278,553,42,90],"cap_2":[278,648,42,21],"moving_3":[416,2,132,132],"receptor_3":[416,140,132,132],"held_3":[416,278,132,132],"confirm_3":[416,416,132,132],"body_3":[416,553,42,90],"cap_3":[416,648,42,21],"upper_icon_0_normal":[2,672,114,113],"upper_icon_1_normal":[2,786,114,113],"upper_icon_0_low":[122,672,114,113],"upper_icon_1_low":[122,786,114,113],"upper_icon_0_advantage":[242,672,114,113],"upper_icon_1_advantage":[242,786,114,113]};
let revisedUI;
const C=M.colors,INK='#171827',PAPER='#fff5e8',TINT=['#ffe64d','#36d8fa'],beat=60/M.chart.bpm;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},mod=(x,n)=>(x%n+n)%n;
let ready=false,loading=null,atlas,logo,settings={downscroll:false,scrollSpeed:870},lastClock=0,lastSync=0,playPending=false;
const stage=document.createElement('video');stage.preload='auto';stage.muted=true;stage.defaultMuted=true;stage.playsInline=true;stage.setAttribute('playsinline','');stage.disablePictureInPicture=true;
function loadVideo(){return new Promise((resolve,reject)=>{let timer=setTimeout(()=>finish(Error('第三首的舞台文件载入超时')),25000);const finish=e=>{clearTimeout(timer);stage.removeEventListener('loadeddata',ok);stage.removeEventListener('error',bad);e?reject(e):resolve();};const ok=()=>finish(),bad=()=>finish(Error('无法读取第三首的舞台视频'));stage.addEventListener('loadeddata',ok,{once:true});stage.addEventListener('error',bad,{once:true});stage.src=M.background;stage.load();if(stage.readyState>=2)ok();});}
function loadArt(){if(!loading)loading=Promise.all([new Promise((resolve,reject)=>{
 revisedUI=new Image();revisedUI.onload=resolve;revisedUI.onerror=()=>reject(Error('第三首箭头与头像载入失败'));revisedUI.src='assets/song03/readable-ui-01.png?v=palette03';
}),new Promise((resolve,reject)=>{atlas=new Image();atlas.onload=resolve;atlas.onerror=()=>reject(Error('第三首角色素材缺失'));atlas.src='assets/song03/atlas.png';}),new Promise((resolve,reject)=>{logo=new Image();logo.onload=resolve;logo.onerror=reject;logo.src='assets/song03/logo.png';}),loadVideo()]).then(()=>{ready=true;}).catch(e=>{loading=null;throw e;});return loading;}
function seek(t){if(!stage.seeking&&stage.readyState>=1&&Math.abs(stage.currentTime-t)>.025)stage.currentTime=t;}
function pauseStage(){if(!stage.paused)stage.pause();stage.playbackRate=1;}
function transport(t,playing){
 if(!ready)return;const target=clamp(t,0,Math.max(0,stage.duration-.016));const jump=Math.abs(target-lastClock)>.30;lastClock=target;
 if(!playing||t<0){pauseStage();seek(target);return;}
 let drift=target-stage.currentTime;const now=performance.now();
 if((jump||Math.abs(drift)>.15)&&now-lastSync>100&&!stage.seeking){seek(target);lastSync=now;drift=0;}
 if(stage.paused&&!playPending){playPending=true;stage.play().catch(()=>{}).finally(()=>{playPending=false;});}
 if(!stage.seeking)stage.playbackRate=clamp(1+drift*.72,.94,1.06);
}
function find(arr,t,get){let l=0,r=arr.length;while(l<r){const m=(l+r)>>>1;if(get(arr[m])<=t)l=m+1;else r=m;}return l-1;}
function spr(ctx,k,x,y,w=null,h=null){const region=revisedSprites[k]||A[k], image=revisedSprites[k]?revisedUI:atlas;if(region&&image)ctx.drawImage(image,...region,Math.round(x),Math.round(y),w??region[2],h??region[3]);}
function cen(ctx,k,x,y,w=null,h=null){const a=A[k];if(!a)return;w=w??a[2];h=h??a[3];spr(ctx,k,x-w/2,y-h/2,w,h);}
function rect(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function round(ctx,x,y,w,h,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function txt(ctx,v,x,y,size,c=PAPER,stroke=3){ctx.font=`900 ${size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle=INK;ctx.lineWidth=stroke*2;ctx.strokeText(v,x,y);ctx.fillStyle=c;ctx.fillText(v,x,y);}
function idle(t){return mod((t-M.chart.beatOrigin)/beat,1)<.34?'idleB':'idleA';}
function idleScene(t){const p=idle(t);return ((14.05<=t&&t<16.12)||(129.1<=t&&t<138.875))?'heart'+p.slice(-1):p;}
let poseChart=null,bySide=[[],[]];
function autoPose(s,t){if(poseChart!==M.chart){poseChart=M.chart;bySide=[0,1].map(side=>M.chart.events.filter(n=>n.side===side));}const a=bySide[s],j=find(a,t+1e-9,n=>n.hit);if(j>=0){const n=a[j];let end=Math.max(.18,n.hold);if(j+1<a.length&&a[j+1].hit-n.hit<=.29)end=Math.max(end,a[j+1].hit-n.hit);if(t-n.hit<end)return DIR[n.lane];}return idleScene(t);}
function opacity(t,s){if(t>=M.fade[1]||t>=M.logo||(s===1&&t>=201.88))return 0;if(t>=M.fade[0])return s===0?1-smooth((t-M.fade[0])/(M.fade[1]-M.fade[0])):0;if(t<.42)return smooth((t-.29)/.13);return 1;}
function performer(ctx,t,s,p){let a=opacity(t,s);if(a<=0)return;let foot=M.foot[settings.downscroll?1:0],key='actor'+s+'_'+p,miss=p==='miss';if(!A[key])key='actor'+s+'_'+idleScene(t);if(t>=M.fade[0])key='actor0_idleA';ctx.save();ctx.globalAlpha=a;
 if(154.25<=t&&t<155.64)ctx.filter='brightness('+String(1-.21*smooth((t-154.25)/.21))+')';spr(ctx,key,R[s]-M.anchor[0],foot-M.anchor[1]);ctx.restore();
 if(miss){ctx.save();ctx.globalAlpha=a;for(let i=0;i<3;i++)round(ctx,R[s]-22+i*17,foot-M.anchor[1]+39+i*5,6,38-i*4,3,'#333a61');ctx.restore();}
}
function drawScene(ctx,t,poses,state){ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);rect(ctx,0,0,W,H,'#000');ctx.imageSmoothingEnabled=true;
 if(t>=M.logo){if(t<M.logoEnd&&logo)ctx.drawImage(logo,0,0,W,H);}
 else if(t>=M.fade[1]){/* synchronized all-black ending */}
 else if(ready&&stage.readyState>=2&&t>=0)ctx.drawImage(stage,0,0,W,H);
 else if(t>=.42&&t<M.fade[0]){rect(ctx,0,0,960,H,C[1]);rect(ctx,960,0,960,H,C[0]);}
 let p0=autoPose(0,t),p1=state?.autoSides?.[1]?autoPose(1,t):poses?.sekai||idle(t);if(p1!=='miss'&&!DIR.includes(p1))p1=idleScene(t);
 if(t>=M.fade[0])p0='idleA';performer(ctx,t,0,p0);performer(ctx,t,1,p1);ctx.restore();
}
function gameOver(ctx,t=0,opt={}){pauseStage();ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);rect(ctx,0,0,W,H,'#03050d');const a=opt.phase==='retry'?1-clamp((opt.retryAge-.75)/.65):1,settle=opt.phase==='enter'?18*Math.max(0,1-t/.5)**2:0;const r=A.defeat,x=960-r[2]/2,y=910-r[3]-settle;
 ctx.globalAlpha=a;const floor=ctx.createRadialGradient(960,914,8,960,914,250);floor.addColorStop(0,'#23355655');floor.addColorStop(1,'#23355600');ctx.fillStyle=floor;ctx.beginPath();ctx.ellipse(960,914,250,24,0,0,Math.PI*2);ctx.fill();spr(ctx,'defeat',x,y);
 const pulse=opt.phase==='retry'?.5+.5*Math.sin((opt.retryAge||0)*Math.PI*10):.5+.5*Math.sin(t*Math.PI*1.8);ctx.globalAlpha=a*(.12+.86*pulse);
 for(let s=0;s<2;s++){spr(ctx,'halo'+s,x,y);spr(ctx,'tail'+s,x,y);spr(ctx,'bunhalo'+s,x,y);spr(ctx,'bun'+s,x,y);}ctx.restore();return {phase:opt.phase||'loop',defeatedPose:true,pulse,glowMasks:M.defeatGlow};
}
const scene={load:()=>loadArt().then(()=>scene),draw:drawScene,idle,configure:()=>scene,drawGameOver:gameOver,transport,pauseStage,get ready(){return ready;},get media(){return {time:stage.currentTime,paused:stage.paused,seeking:stage.seeking,readyState:stage.readyState,duration:stage.duration,drift:lastClock-stage.currentTime};}};track.scene=scene;
if(new URLSearchParams(location.search).get('test')==='1')scene.prepareExportFrame=async t=>{pauseStage();const target=clamp(t,0,Math.max(0,stage.duration-.001));if(stage.seeking||Math.abs(stage.currentTime-target)>.0001)await new Promise((resolve,reject)=>{let timer=setTimeout(()=>{stage.removeEventListener('seeked',done);reject(Error('舞台精确帧超时'));},5000);function done(){clearTimeout(timer);stage.removeEventListener('seeked',done);resolve();}stage.addEventListener('seeked',done);stage.currentTime=target;});return stage.currentTime;};

const icon=share=>share<.25?'low':share>.75?'advantage':'normal';
function lane(s,l){return {x:(s?1245:195)+160*l,y:settings.downscroll?934:146};}
function ns(s,n){return s.noteStates?.get?.(n.id)||s.noteStates?.[n.id]||{};}
function good(s){return s.judged&&!['miss','ghost','drop'].includes(s.judgement);}
function hud(ctx,t,s){
 const share=clamp(Number.isFinite(s.health)?s.health:.5),seam=510+Math.round(900*share),down=settings.downscroll,y=down?59:998;
 round(ctx,505,y-5,910,34,13,PAPER);round(ctx,508,y-2,904,28,10,INK);ctx.save();ctx.beginPath();ctx.roundRect(510,y,900,24,9);ctx.clip();rect(ctx,510,y,900,24,C[1]);rect(ctx,510,y,seam-510,24,C[0]);ctx.restore();
 ctx.fillStyle=INK;ctx.beginPath();ctx.ellipse(seam,y+13,9,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f873ad';ctx.beginPath();ctx.ellipse(seam,y+13,5,5,0,0,Math.PI*2);ctx.fill();
 const states=[icon(share),icon(1-share)];for(let s0=0;s0<2;s0++){const k=`icon_${s0}_${states[s0]}`,a=A[k];spr(ctx,down?'upper_'+k:k,seam+(s0?2:-a[2]-2),down?y+18:y-a[3]+7);const score=String(s.scores?.[s0]||0).padStart(6,'0'),combo=String(s.combo?.[s0]||0).padStart(3,'0'),acc=(s.accuracy?.[s0]??100).toFixed(2);txt(ctx,`SCORE ${score}   COMBO ${combo}   ACC ${acc}%`,s0?1290:630,down?29:1051,24,TINT[s0],2);const p=s.pop?.[s0];if(p&&p.age<.25&&['sick','good','bad','shit'].includes(p.kind)){let label=p.kind==='sick'?'SICK!':p.kind==='good'?'GOOD!':p.kind==='bad'?'BAD!':'BAD!',x=down?(s0?1090:830):(s0?1320:600),yy=down?829:240;txt(ctx,label,x+3,yy+3,38,'#ff507f',3);txt(ctx,label,x,yy,38);txt(ctx,combo,x,yy+34,29);}}
 return {health:share,iconStates:states};
}
function drawUI(ctx,t,notes,s={},w=ctx.canvas.width,h=ctx.canvas.height){if(!ready||t>=M.fade[1])return {notesDrawn:0,sustainDrawn:0,health:s.health};t=Math.max(0,t);const down=settings.downscroll,sign=down?-1:1,speed=settings.scrollSpeed;ctx.save();ctx.scale(w/W,h/H);if(t>M.fade[0])ctx.globalAlpha=1-smooth((t-M.fade[0])/(M.fade[1]-M.fade[0]));const v=hud(ctx,t,s),a0=ctx.globalAlpha;ctx.imageSmoothingEnabled=true;const start=Math.max(0,find(notes,t-M.maxHold-1.8,n=>n.hit)),end=Math.min(notes.length,find(notes,t+(H+160)/speed,n=>n.hit)+1),S=M.arrowSize;let num=0,holds=0;
 for(let ss=0;ss<2;ss++)for(let l=0;l<4;l++){let p=lane(ss,l);cen(ctx,'receptor_'+l,p.x,p.y,S,S);}
 ctx.save();if(down){ctx.translate(0,H);ctx.scale(1,-1);}
 for(let i=start;i<end;i++){const n=notes[i];if(n.hold<=0||t>=n.hit+n.hold)continue;const st=ns(s,n),x=lane(n.side,n.lane).x,hy=146+(n.hit-t)*speed,tail=146+(n.hit+n.hold-t)*speed;if(tail<0||hy>H+130)continue;const active=good(st)&&!st.dropped&&t>=n.hit,head=active?Math.max(146,hy):hy;ctx.save();if(st.dropped||st.judgement==='miss')ctx.globalAlpha=a0*.48;if(active){ctx.beginPath();ctx.rect(0,146,W,H-146);ctx.clip();}const capHeight=Math.min(20,Math.max(0,tail-head)),yy=tail-capHeight;if(yy>head)spr(ctx,'body_'+n.lane,x-20,head,40,yy-head);if(capHeight>0)spr(ctx,'cap_'+n.lane,x-20,yy,40,capHeight);ctx.restore();holds++;}
 ctx.restore();
 for(let i=start;i<end;i++){const n=notes[i],st=ns(s,n),p=lane(n.side,n.lane),y=p.y+(n.hit-t)*speed*sign;if(y<-S||y>H+S||good(st)||(s.autoSides?.[n.side]&&n.hit<=t))continue;ctx.save();if(st.judgement==='miss')ctx.globalAlpha=a0*.5;cen(ctx,'moving_'+n.lane,p.x,y,S,S);ctx.restore();num++;}
 for(let ss=0;ss<2;ss++)for(let l=0;l<4;l++){let st=s.laneStates?.[ss]?.[l]||{},p=lane(ss,l),age=t-(st.confirmAt??-1000);if(age>=0&&age<.105){cen(ctx,'confirm_'+l,p.x,p.y,S,S);const accent=['#c9afff','#9ec2ff','#ffc08d','#ff96b0'][l];for(let sg of [-1,1]){let x=p.x+sg*(62+80*age),y=p.y;ctx.beginPath();ctx.moveTo(x,y-13);ctx.lineTo(x+sg*5,y-5);ctx.lineTo(x+sg*5,y+5);ctx.lineTo(x,y+13);ctx.strokeStyle=INK;ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.stroke();}}else if(st.held||st.pressed)cen(ctx,'held_'+l,p.x,p.y,S,S);}
 ctx.restore();return {notesDrawn:num,sustainDrawn:holds,...v};
}
const ui={load:async base=>{await Promise.all([loadArt(),oldUI.loadCountdown(base)]);return ui;},configure:o=>{if(o?.config)settings={...settings,...o.config};return ui;},draw:drawUI,lanePosition:lane,iconState:icon,displayHealth:s=>({health:s.health,iconStates:[icon(s.health),icon(1-s.health)]}),warmSplashes:()=>Promise.resolve(),getExtraImage:n=>oldUI.getExtraImage(n),get ready(){return ready;}};track.ui=ui;
};
})(window);
