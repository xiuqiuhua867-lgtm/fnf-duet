(function(root){
 'use strict';
 const tracks=root.FNFTrackMenu.tracks;
 tracks['02'].installScene=function(){
 const M=root.SONG02_DATA, oldUI=tracks['01'].ui, mod=(x,n)=>((x%n)+n)%n, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const W=1920,H=1080,G=4,ROOTS=[608,1312],roles=['matsuri','ayame'],dirs=['left','down','up','right'],beat=60/M.chart.bpm;
 const time=M.scene, assets={}, pal=M.palette, A=M.frames;
 let loadPromise=null,ready=false,hud={offset:0,feet:[776,776],visible:true},setting={downscroll:false,scrollSpeed:870};
 function image(name,file){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{assets[name]=im;resolve();};im.onerror=()=>reject(Error('缺少第二首歌素材：'+file));im.src='assets/song02/'+file;});}
 function loadAssets(){if(!loadPromise)loadPromise=Promise.all(Object.entries(M.images).map(([n,p])=>image(n,p))).then(()=>{ready=true;}).catch(e=>{loadPromise=null;throw e;});return loadPromise;}
 function sprite(ctx,n,x,y,scale=1,scaleY=scale){const r=A[n];if(!r)return;ctx.drawImage(assets.atlas,...r,Math.round(x),Math.round(y),Math.round(r[2]*scale),Math.round(r[3]*scaleY));}
 function centered(ctx,n,x,y,scale=1){const r=A[n];if(r)sprite(ctx,n,x-r[2]*scale/2,y-r[3]*scale/2,scale);}
 function background(ctx,n,x=0,y=0,w=W,h=H){ctx.drawImage(assets[n],Math.round(x),Math.round(y),w,h);}
 function floorRect(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
 function find(arr,t,get){let l=0,r=arr.length;while(l<r){const m=(l+r)>>>1;if(get(arr[m])<=t)l=m+1;else r=m;}return l-1;}
 function idle(t){return 'idle_'+String(Math.min(23,Math.floor(mod((t-M.chart.beatOrigin)/(2*beat),1)*24))).padStart(2,'0');}
 function autoPose(side,t){const arr=M.pose[side],n=find(arr,Math.floor((t+M.previewPre)*60),p=>p[0]);return n<0?idle(t):arr[n][1];}
 function playerPose(t,input,state){
   if(state?.autoSides?.[1])return autoPose(1,t);
   if(input==='miss')return 'miss';
   if(!dirs.includes(input))return idle(t);
   const last=state?.recentHeads?.[1],age=last?Math.max(0,t-last.t):1;
   const held=state?.laneStates?.[1]?.[dirs.indexOf(input)]?.held;
   if(age<.045||(!held&&age>.145))return input+'_mid';
   return input;
 }
 function performer(ctx,side,key,x,foot,scale){let miss=key==='miss';if(miss)key='idle';if(!A[roles[side]+'_'+key])key='idle';const off=M.offsets[roles[side]][key]||0,n=roles[side]+'_'+key;ctx.save();if(miss)ctx.globalAlpha=.85;
   sprite(ctx,n,x-32*scale+off*scale,foot-82*scale+(miss?5:0),scale);ctx.restore();
   if(miss){const col='#344260';for(let j=0;j<3;j++)floorRect(ctx,x-20+j*10,foot-82*scale+28+j*3,5,25-j*3,col);}
 }
 function shadow(ctx,x,t){const c=t<time.firstCut?'#57270d':'#b85d16';floorRect(ctx,x-56,775,111,8,c);floorRect(ctx,x-48,784,96,3,c);}
 function drawKeys(ctx,t,keys,foot=776,scale=6,offset=0){for(let s=0;s<2;s++)performer(ctx,s,keys[s],ROOTS[s]+offset,foot,scale);}
 const scratch=document.createElement('canvas');scratch.width=W;scratch.height=H;const sc=scratch.getContext('2d');sc.imageSmoothingEnabled=false;
 // Both passes paint an opaque background; the reveal reuses scratch after compositing the outgoing frame.
 function mario(ctx,t,keys){background(ctx,'mario'+Math.floor(Math.max(0,t-M.chart.beatOrigin)/.23)%3);for(let s=0;s<2;s++)shadow(ctx,ROOTS[s],t);drawKeys(ctx,t,keys);}
 function settingCollapse(ctx,t,keys){mario(sc,t,keys);ctx.save();ctx.filter='invert(1) brightness(.38)';ctx.drawImage(scratch,0,0);ctx.restore();floorRect(ctx,0,0,W,H,'rgba(12,13,30,.25)');const idx=clamp(find(time.textCues,t,x=>x),0,3);background(ctx,'glyph'+idx);}
 function hallZero(ctx,keys){ctx.drawImage(assets.hall,0,0,480,270,0,0,W,H);drawKeys(ctx,0,keys);}
 function firstTransition(ctx,t,keys){
   settingCollapse(ctx,Math.min(t,time.firstCut-.00001),keys);hallZero(sc,keys);
   let u=clamp((t-time.reveal[0])/(time.reveal[1]-time.reveal[0]),0,1);u=u*u*(3-2*u);
   for(let y=0;y<15;y++)for(let x=0;x<24;x++){let alpha=clamp((u*1.14-M.transitionRank[y][x])/.14,0,1);if(alpha<=0)continue;ctx.globalAlpha=alpha;ctx.drawImage(scratch,x*80,y*72,80,72,x*80,y*72,80,72);}ctx.globalAlpha=1;
 }
 function tetrisState(t){
   const plans=M.tetris.plans,j=find(plans,t,x=>x.t);if(j<0)return {board:plans[0].before,fall:null,clears:0,offset:0,rows:[]};
   const p=plans[j];let a=p.before,n=p.count-p.pending.length,rows=[],fall=null;
   if(t<p.drop){let z=clamp((t-p.t)/(p.drop-p.t),0,1);fall={k:p.k,x:Math.round(p.startx+(p.x-p.startx)*z),y:p.spawn,shape:p.shape};}
   else if(t<p.land){let z=clamp((t-p.drop)/(p.land-p.drop),0,1);fall={k:p.k,x:p.x,y:p.spawn+(p.y-p.spawn)*z**1.45,shape:p.shape};}
   else if(p.pending.length&&t<p.clear){a=p.locked;rows=p.pending;}else{a=p.after;n=p.count;}
   let dy=0,last=find(M.tetris.events,t,x=>x[0]);if(last>=0&&t-M.tetris.events[last][0]<.26)dy=-20*(1-((t-M.tetris.events[last][0])/.26)**2);
   return {board:a,fall,clears:n,offset:dy,rows};
 }
 function block(ctx,x,y,k){const c=pal[k];if(!c)return;floorRect(ctx,x,y,80,80,'#141720');floorRect(ctx,x+4,y+4,72,72,c[0]);floorRect(ctx,x+4,y+4,72,8,c[1]);floorRect(ctx,x+4,y+8,8,64,c[1]);floorRect(ctx,x+8,y+68,68,8,c[2]);floorRect(ctx,x+68,y+12,8,60,c[2]);}
 function tetris(ctx,t,keys,offset=0,withActors=true){
   const s=tetrisState(t),Y0=-14,foot=Math.round((Y0+(7+s.clears)*20+s.offset)*4);ctx.save();ctx.translate(offset,0);ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();floorRect(ctx,0,0,W,H,'#171b28');
   for(let x=0;x<W;x+=80)floorRect(ctx,x,0,4,904,'#252b3a');for(let y=Y0*4;y<904;y+=80)floorRect(ctx,0,y,W,4,'#252b3a');
   for(let r=0;r<12;r++)for(let c=0;c<24;c++)if(s.board[r][c])block(ctx,c*80,Math.round((Y0+r*20+s.offset)*4),s.board[r][c]);
   if(s.fall)for(const [u,v] of s.fall.shape)block(ctx,(s.fall.x+u)*80,Math.round((Y0+(s.fall.y+v)*20)*4),s.fall.k);
   for(const row of s.rows){let y=(Y0+row*20)*4;floorRect(ctx,0,y,W,80,'#f4f1df');for(let x=0;x<W;x+=80)floorRect(ctx,x,y,4,80,'#c7b99c');}
   floorRect(ctx,0,904,W,176,'#171a24');floorRect(ctx,0,904,W,4,'#697588');
   const tf='teto_'+mod(Math.floor((t-time.tetrisStart)*30),15);const tr=A[tf];sprite(ctx,tf,960-tr[2]*3/2,foot+80-tr[3]*3,3);if(withActors)drawKeys(ctx,t,keys,foot);ctx.restore();return foot;
 }
 function corridor(ctx,t,keys){const q=clamp((t-time.panStart)/(time.tetrisStart-time.panStart),0,1);const camera=Math.round(1440*q*q*(3-2*q))*4,seam=5760-camera;ctx.drawImage(assets.hall,camera/4,0,480,270,0,0,W,H);
   let foot=776;if(seam<W)foot=tetris(ctx,t,keys,seam,false);
   for(const [x,n] of [[4260,'frisk'],[4920,'sans']]){const z=A[n];sprite(ctx,n,x-camera-z[2]/2,776-z[3]);}
   hud.visible=false;
   for(const [off,fy] of [[0,776],[5760,foot]]){let dx=off-camera;if(dx>=W||dx+W<=0)continue;drawKeys(ctx,t,keys,fy,6,dx);hud={offset:dx,feet:[fy,fy],visible:true};}
   if(seam>0&&seam<W){let u=1-seam/W,l=Math.round((W-(W+2520)*u)/4)*4;background(ctx,'column',l,0,2520,H);hud.occlusion=[l,l+2520];if(l<=0&&l+2520>=W)hud.visible=false;}
 }
 const dg=M.dino;
 function dino(ctx,t,keys){
   const dt=Math.max(0,t-time.dinoCut);background(ctx,'dinoBase');let f=mod(Math.floor((t-time.dinoCut)/(2*beat)*M.warningPhases),M.warningPhases);ctx.drawImage(assets.warning,(f%6)*480,Math.floor(f/6)*270,480,270,0,0,W,H);
   [[30,50],[302,63],[460,90]].forEach(([x,y],j)=>sprite(ctx,'cloud',(Math.round(mod(x-dt*(12+1.5*j),480+80))-48)*4,y*4,4));
   const slide=Math.round(dt*760/4)%1200;sprite(ctx,'horizon',-slide*4,844,4);sprite(ctx,'horizon',(1200-slide)*4,844,4);sprite(ctx,'hi',(480-98)*4,40,4);
   const score=String(Math.floor(dt*16)).padStart(5,'0').slice(-5);[...score].forEach((v,j)=>sprite(ctx,'digit'+v,(480-72+j*10)*4,40,4));
   for(const [ct,kind,j] of dg.events){if(Math.abs(ct-dt)>3)continue;let n,s,x,y;
     if(kind==='cactus'){n='cactus'+j;const r=A[n];s=r[3]<=35?3:2;x=Math.round(ROOTS[1]+30-r[2]*s/2+760*(ct-dt));y=860-r[3]*s;}
     else{n='bird'+Math.floor(dt*6)%2;const r=A[n];s=3;x=Math.round(ROOTS[1]-r[2]*s/2+760*(ct-dt));y=200;}
     const r=A[n];if(x<W&&x+r[2]*s>0)sprite(ctx,n,x,y,s);
   }
   let feet=[];
   for(let j=0;j<2;j++){
     let lift=0,duck=0,delay=(ROOTS[1]-ROOTS[j])/760;
     for(const [ct,kind] of dg.events){let diff=dt-ct-delay;if(kind==='cactus'&&Math.abs(diff)<=1.25/2)lift=Math.round(145*(1-(diff/(1.25/2))**2));if(kind==='bird'&&Math.abs(diff)<=.61)duck=Math.max(duck,Math.min(1,(.61-Math.abs(diff))/.15));}
     let n=lift?'jump':duck>=.97?'duck'+Math.floor(dt*8)%2:'run'+Math.floor(dt*12)%2;let m=dg.geometry[n],r=A[n],ys=1,deck=m.deck,bottom=m.bottom;
     if(!lift&&duck>0&&duck<.97){let nh=47-Math.round(14*duck);ys=nh/47;deck=Math.round(deck*ys);bottom=Math.round(bottom*ys);}
     const x=ROOTS[j]-m.cx*6,y=860-lift-bottom*6;let fy=y+deck*6;sprite(ctx,n,x,y,6,6*ys);feet.push(fy);performer(ctx,j,keys[j],ROOTS[j],fy,5);
   }hud={offset:0,feet,visible:true};
 }
 function doors(ctx,t){const cut=time.dinoCut;if(t<cut-.27||t>cut+.44)return;let v;if(t<cut-.045){let u=clamp((t-(cut-.27))/.225,0,1);v=1-(1-u)**3;}else if(t<cut+.085)v=1;else{let u=clamp((t-cut-.085)/.355,0,1);v=1-u*u*(3-2*u);}let x=Math.round((1-v)*960);background(ctx,'doorL',-x,0,960,H);background(ctx,'doorR',960+x,0,960,H);}
 function drawScene(ctx,t,poses,state){if(!ready)return;ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);ctx.imageSmoothingEnabled=false;const keys=[autoPose(0,t),playerPose(t,poses?.sekai||idle(t),state)];hud={offset:0,feet:[776,776],visible:true};
   if(t>=time.reveal[0]&&t<time.reveal[1])firstTransition(ctx,t,keys);
   else if(t<time.firstCut){if(t>=time.textCues[0])settingCollapse(ctx,t,keys);else mario(ctx,t,keys);}
   else if(t<time.tetrisStart)corridor(ctx,t,keys);
   else if(t<time.dinoCut){let f=tetris(ctx,t,keys);hud={offset:0,feet:[f,f],visible:true};doors(ctx,t);}
   else{dino(ctx,t,keys);doors(ctx,t);}
   ctx.restore();
 }
 function gameOver(ctx,t=0,opt={}){
   ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);ctx.imageSmoothingEnabled=false;floorRect(ctx,0,0,W,H,'#03050d');
   // Exactly the first song's dark failure presentation and timing.
   // The existing Chinese overlay title and purple actions remain.
   const fade=opt.phase==='retry'?1-clamp((opt.retryAge-.75)/.65,0,1):1,settle=opt.phase==='enter'?24*Math.pow(Math.max(0,1-t/.5),2):0;
   ctx.globalAlpha=fade;const floor=ctx.createRadialGradient(960,914,8,960,914,250);floor.addColorStop(0,'#23355655');floor.addColorStop(1,'#23355600');ctx.fillStyle=floor;ctx.beginPath();ctx.ellipse(960,914,250,24,0,0,Math.PI*2);ctx.fill();
   const scale=10,x=960-A.defeat[2]*scale/2,y=910-A.defeat[3]*scale-settle;
   sprite(ctx,'defeat',x,y,scale);
   // The two independently registered masks are the ONLY emissive
   // pixels. Their brightness alternates gently; never screen or tint
   // the rest of the hair, face, outfit, mask or background.
   const p0=opt.phase==='retry'?.5+.5*Math.sin((opt.retryAge||0)*Math.PI*10):.5+.5*Math.sin(t*Math.PI*1.8),p1=p0;
   ctx.globalAlpha=fade*(.16+.79*p0);sprite(ctx,'defeat_horn_left',x,y,scale);
   ctx.globalAlpha=fade*(.16+.79*p1);sprite(ctx,'defeat_horn_right',x,y,scale);
   ctx.restore();return {ready:true,phase:opt.phase||'loop',hornPulse:[p0,p1],hornMasks:['defeat_horn_left','defeat_horn_right'],defeatedPose:true};
 }
 const scene={load:()=>loadAssets().then(()=>scene),draw:drawScene,idle,configure:()=>scene,drawGameOver:gameOver,get ready(){return ready;},get hud(){return hud;}};
 tracks['02'].scene=scene;

 // Actual G08 sprite rendering and two-sided live judgement. The judge
 // is unchanged; this layer only reads the current immutable state.
 const textCache=new Map();
 function pixelText(ctx,s,x,y,scale=3,color='#fff8e9'){
   s=String(s);const key=color+'|'+s;let bitmap=textCache.get(key);
   if(!bitmap){const chars=[...s].map(c=>M.glyph[c]||M.glyph[' ']);const width=chars.reduce((a,b)=>a+b[0].length+1,0)-1;bitmap=document.createElement('canvas');bitmap.width=width+2;bitmap.height=9;const c=bitmap.getContext('2d');let px=1;
     for(const glyph of chars){for(let y=0;y<7;y++)for(let x=0;x<glyph[y].length;x++)if(glyph[y][x]==='#'){floorRect(c,px+x-1,1+y,3,1,'#181520');floorRect(c,px+x,y,1,3,'#181520');}px+=glyph[0].length+1;}
     px=1;for(const glyph of chars){for(let y=0;y<7;y++)for(let x=0;x<glyph[y].length;x++)if(glyph[y][x]==='#')floorRect(c,px+x,1+y,1,1,color);px+=glyph[0].length+1;}
     if(textCache.size>=1400)textCache.delete(textCache.keys().next().value);textCache.set(key,bitmap);
   }ctx.drawImage(bitmap,Math.round(x-bitmap.width*scale/2),Math.round(y-bitmap.height*scale/2),bitmap.width*scale,bitmap.height*scale);
 }
 const icon=share=>share<=.30?2:share>=.60?1:0;
 function health(s){let h=clamp(Number.isFinite(s.health)?s.health:.5,0,1);if(s.auto)h=clamp(.5+(h-.5)*M.autoGain,.1,.9);return {health:h,iconStates:[icon(h),icon(1-h)]};}
 function lane(side,l){return {x:(side?1448:100)+124*l,y:setting.downscroll?934:146};}
 function noteState(s,n){return s.noteStates?.get?.(n.id)||s.noteStates?.[n.id]||{};}
 function good(st){return !!st.judged&&!['miss','ghost','drop'].includes(st.judgement);}
 function stepped(ctx,x,y,w,h,step,col){floorRect(ctx,x+step,y,w-step*2,h,col);floorRect(ctx,x,y+step,w,h-step*2,col);}
 function hudDraw(ctx,t,s){
   const h=health(s),by=setting.downscroll?35:944,bx=432,barW=1056,barH=56,seam=bx+16+clamp(Math.round(h.health*256),1,255)*4;
   stepped(ctx,bx,by,barW,barH,12,'#181520');stepped(ctx,bx+4,by+4,barW-8,barH-12,8,'#fff8e9');stepped(ctx,bx+8,by+8,barW-16,barH-20,8,'#181520');floorRect(ctx,bx+16,by+16,seam-bx-16,24,'#edaa43');floorRect(ctx,seam,by+16,bx+barW-16-seam,24,'#d94968');floorRect(ctx,bx+16,by+16,seam-bx-16,4,'#f9cb7a');floorRect(ctx,seam,by+16,bx+barW-16-seam,4,'#f27e9a');floorRect(ctx,seam,by+16,4,24,'#181520');
   const iy=setting.downscroll?64:922-4*Math.exp(-mod((t-M.chart.beatOrigin)/beat,1)*11);
   for(let side=0;side<2;side++){centered(ctx,'icon_'+side+'_'+h.iconStates[side],seam+(side?62:-62),iy,3);const sx=setting.downscroll?(side?1715:205):(side?1218:702),combo=s.combo?.[side]||0,score=s.scores?.[side]||0,acc=s.accuracy?.[side]??100;
     const scoreText=(score<0?'-':'')+String(Math.abs(score)).padStart(6,'0');pixelText(ctx,'SCORE '+scoreText,sx,setting.downscroll?34:1017,setting.downscroll?2:3);pixelText(ctx,'COMBO '+String(combo).padStart(3,'0')+' ACC '+acc.toFixed(2)+'%',sx,setting.downscroll?68:1048,setting.downscroll?2:3);
     const pop=s.pop?.[side];if(pop&&pop.age>=0&&pop.age<.34&&['sick','good','bad','shit'].includes(pop.kind)){ctx.save();ctx.globalAlpha=clamp((.34-pop.age)/.10,0,1);const yy=Math.min(850,hud.feet[side]+26)-pop.age*22;centered(ctx,'judge_'+(pop.kind==='shit'?'bad':pop.kind),ROOTS[side],yy);pixelText(ctx,String(combo).padStart(3,'0'),ROOTS[side],yy+41,4);ctx.restore();}
   }return h;
 }
 function drawUI(ctx,t,notes,s={},width=ctx.canvas.width,height=ctx.canvas.height){if(!ready)return {};t=Math.max(0,t);const speed=Number.isFinite(setting.scrollSpeed)?setting.scrollSpeed:870,down=setting.downscroll,sign=down?-1:1;
   if(!hud.visible&&Math.abs(t-time.panStart)<12)return {notesDrawn:0,sustainDrawn:0,health:s.health};ctx.save();ctx.scale(width/W,height/H);if(hud.occlusion){ctx.beginPath();ctx.rect(0,0,W,H);ctx.rect(hud.occlusion[0],0,hud.occlusion[1]-hud.occlusion[0],H);ctx.clip('evenodd');}ctx.translate(hud.offset,0);ctx.imageSmoothingEnabled=false;const h=hudDraw(ctx,t,s);
   const begin=Math.max(0,find(notes,t-M.maxHold-1.8,n=>n.hit)),end=Math.min(notes.length,find(notes,t+(H+160)/speed,n=>n.hit)+1);let noteCount=0,holdCount=0;
   for(let side=0;side<2;side++)for(let l=0;l<4;l++){let p=lane(side,l);centered(ctx,'idle_'+l,p.x,p.y);}
   // Draw all tails behind heads, with a single rounded native cap and
   // no arbitrary viewport slicing. A miss continues past the receptor.
   ctx.save();if(down){ctx.translate(0,H);ctx.scale(1,-1);}
   for(let i=begin;i<end;i++){
     let n=notes[i];if(!(n.hold>0)||t>=n.hit+n.hold)continue;let st=noteState(s,n),x=lane(n.side,n.lane).x,head=146+(n.hit-t)*speed,tail=146+(n.hit+n.hold-t)*speed;
     if(tail<0||head>H+120)continue;let active=good(st)&&!st.dropped&&t>=n.hit,top=active?Math.max(146,head):head;const body=A['body_'+n.lane],cap=A['cap_'+n.lane];ctx.save();if(st.dropped||st.judgement==='miss')ctx.globalAlpha=.45;
     if(active){ctx.beginPath();ctx.rect(0,146,W,H-146);ctx.clip();}let capY=tail-cap[3],bodyY=Math.round(top);if(capY>bodyY)ctx.drawImage(assets.atlas,...body,x-body[2]/2,bodyY,body[2],Math.ceil(capY-bodyY));sprite(ctx,'cap_'+n.lane,x-cap[2]/2,capY);ctx.restore();holdCount++;
   }ctx.restore();
   for(let i=begin;i<end;i++){let n=notes[i],p=lane(n.side,n.lane),y=p.y+(n.hit-t)*speed*sign,st=noteState(s,n);if(y<-65||y>H+65||good(st)||(s.autoSides?.[n.side]&&n.hit<=t))continue;ctx.save();if(st.judgement==='miss')ctx.globalAlpha=.50;centered(ctx,'note_'+n.lane,p.x,y);ctx.restore();noteCount++;}
   for(let side=0;side<2;side++)for(let l=0;l<4;l++){let st=s.laneStates?.[side]?.[l]||{},p=lane(side,l),age=t-(st.confirmAt??-1000);if(age>=0&&age<.115)centered(ctx,'confirm_'+l,p.x,p.y);else if(st.held||st.pressed)centered(ctx,'press_'+l,p.x,p.y);if(age>=0&&age<.135)centered(ctx,'burst_'+l+'_'+Math.min(3,Math.floor(age/.034)),p.x,p.y);}
   ctx.restore();return {notesDrawn:noteCount,sustainDrawn:holdCount,...h};
 }
 const ui={load:async(base)=>{await Promise.all([loadAssets(),oldUI.loadCountdown(base)]);return ui;},configure:o=>{if(o?.config)setting={...setting,...o.config};return ui;},draw:drawUI,lanePosition:lane,iconState:icon,displayHealth:health,warmSplashes:()=>Promise.resolve(),getExtraImage:n=>oldUI.getExtraImage(n),get ready(){return ready;}};
 tracks['02'].ui=ui;
 };
})(window);
