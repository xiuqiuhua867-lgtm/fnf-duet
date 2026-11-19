(function(root){
'use strict';
const images={},states=['idle_A','idle_B','idle_C','idle_D','left','down','up','right'];
let ready=false;
const BEAT=60/128,ORIGIN=1.0625;
let cameraTrace=[],cameraBars=[],cameraConfig={enabled:true,bpm:128,origin:1.0625,duration:189.5,first:Infinity,last:0};
function configure(chart={},options={}){
  const bpm=chart.bpm||128,origin=chart.beatOrigin??1.0625,duration=chart.duration||189.5,barLength=240/bpm;
  const notes=(chart.events||[]).filter(n=>String(n.base_id||'').startsWith('main:'));
  cameraConfig={enabled:options.enabled!==false,bpm,origin,duration,first:Math.min(...notes.map(n=>n.hit)),last:Math.max(0,...notes.map(n=>n.end||n.hit+.12))};
  cameraBars=[];
  for(let i=Math.floor(-origin/barLength);i<=Math.ceil((duration-origin)/barLength);i++){
    const start=origin+i*barLength,end=start+barLength,weights=[0,0];
    for(const n of notes){const overlap=Math.max(0,Math.min(end,(n.end||n.hit+.12))-Math.max(start,n.hit));if(overlap>0)weights[n.side]+=Math.min(.45,overlap);}
    const peak=Math.max(...weights),ratio=peak?Math.min(...weights)/peak:0;
    const focus=peak===0?'quiet':ratio>=.38?'duet':weights[0]>weights[1]?'joucho':'sekai';
    cameraBars.push({index:i,start,end,weights,focus,zoom:focus==='quiet'?1:focus==='duet'?1.025:1.055,panX:focus==='joucho'?16:focus==='sekai'?-16:0});
  }
  cameraTrace=[];let zoom=1,panX=0;const step=.05,alpha=1-Math.exp(-step/.6);
  for(let k=0;k<=Math.ceil(duration/step)+1;k++){
    const t=k*step,bar=cameraBars.find(b=>t>=b.start&&t<b.end)||cameraBars[cameraBars.length-1];
    const active=t>=cameraConfig.first,targetZoom=active?bar.zoom:1,targetPan=active?bar.panX:0;
    zoom+=(targetZoom-zoom)*alpha;panX+=(targetPan-panX)*alpha;
    cameraTrace.push({zoom,panX,focus:active?bar.focus:'quiet'});
  }
  return api;
}
function cameraAt(time){
  if(!cameraConfig.enabled||time<0||!cameraTrace.length)return {zoom:1,panX:0,panY:0,focus:'quiet'};
  const t=Math.max(0,Math.min(cameraConfig.duration,time)),k=Math.floor(t/.05),u=t/.05-k;
  const a=cameraTrace[k],b=cameraTrace[Math.min(k+1,cameraTrace.length-1)];
  const phase=((t-cameraConfig.origin)%(240/cameraConfig.bpm)+(240/cameraConfig.bpm))%(240/cameraConfig.bpm);
  const pulse=t>=cameraConfig.first&&t<=cameraConfig.last+.3?.006*(1-Math.exp(-phase/.012))*Math.exp(-phase/.18):0;
  const zoom=a.zoom+(b.zoom-a.zoom)*u+pulse;
  const panX=Math.max(-.85*(zoom-1)*960,Math.min(.85*(zoom-1)*960,a.panX+(b.panX-a.panX)*u));
  return {zoom,panX,panY:0,focus:a.focus,pulse,anchor:[960,300]};
}
function idle(t){
  const p=((t-ORIGIN)%BEAT+BEAT)%BEAT;
  return p<1/12?'idle_B':p<1/12+1/8?'idle_C':p<1/12+1/4?'idle_D':'idle_A';
}
async function load(base='assets/'){
  if(!base.endsWith('/'))base+='/';
  const im=new Image();im.src=base+'packed/court.webp';
  await Promise.all([im.decode(),WebArt.load('joucho'),WebArt.load('sekai'),WebArt.load('hud')]);
  images.background=im;
  for(const i of [0,3,5])images['judge_'+i]=WebArt.surface('judge_'+i);
  configure(root.COURT_DATA?.chart||{});ready=true;return api;
}
function draw(ctx,t,poses={}){
  if(!ready)return;
  const w=ctx.canvas.width,h=ctx.canvas.height;
  ctx.save();ctx.scale(w/1920,h/1080);
  const camera=cameraAt(t);
  // Camera applies to the entire world, preserving feet/table contact. HUD is drawn after restore.
  ctx.translate(960+camera.panX,300);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-960,-300);
  ctx.drawImage(images.background,0,0,1920,1080);
  // Whole original upper-body sprites share one common crop and one transform.
  // The old recording's up-centre-down-centre cycle is retimed to the song beat.
  const p=(((t-ORIGIN)%BEAT)+BEAT)%BEAT/BEAT;
  const frame=p<102/473?3:p<(102+135)/473?0:p<(102+135+100)/473?5:0;
  const im=images['judge_'+frame],jw=200,jh=im.height*jw/im.width;
  ctx.drawImage(im,960-jw/2,438-jh,jw,jh);
  // Original bench foreground restores natural occlusion, without painting over it.
  ctx.drawImage(images.background,780,435,365,215,780,435,365,215);
  for(const [actor,cx]of [['joucho',610],['sekai',1310]]){
    let state=poses[actor]||idle(t);
    if(!states.includes(state)&&!(actor==='sekai'&&state==='miss'))state='idle_A';
    const scale=.35,foot=696;
    ctx.fillStyle='rgba(43,24,12,.17)';
    ctx.beginPath();ctx.ellipse(cx,foot+1,37,4,0,0,Math.PI*2);ctx.fill();
    WebArt.draw(ctx,actor+'_'+state,cx-640*scale,foot-1580*scale,scale);
  }
  ctx.restore();
}
function drawGameOver(ctx,elapsed=0,options={}){
  const t=Math.max(0,elapsed),phase=options.phase||'loop',retry=Math.max(0,options.retryAge||0);
  ctx.save();ctx.scale(ctx.canvas.width/1920,ctx.canvas.height/1080);
  ctx.fillStyle='#03050d';ctx.fillRect(0,0,1920,1080);
  if(!ready){ctx.restore();return {ready:false};}
  const scale=.64;
  const settle=phase==='enter'?24*Math.pow(Math.max(0,1-t/.5),2):0;
  const x=960-640*scale,y=910-1580*scale-settle;
  const fade=phase==='retry'?1-Math.min(1,Math.max(0,retry-.75)/.65):1;
  ctx.globalAlpha=fade;
  const floor=ctx.createRadialGradient(960,914,8,960,914,250);
  floor.addColorStop(0,'#23355655');floor.addColorStop(1,'#23355600');
  ctx.fillStyle=floor;ctx.beginPath();ctx.ellipse(960,914,250,24,0,0,Math.PI*2);ctx.fill();
  WebArt.draw(ctx,'sekai_gameover',x,y,scale);
  // Only the attached flower receives a slow brightness pulse. The face and body stay still.
  const pulse=phase==='retry'?.5+.5*Math.sin(retry*Math.PI*10):.5+.5*Math.sin(t*Math.PI*1.8);
  // Restrict the highlight to the ornament's circular centre; never brighten hair with a guessed polygon.
  ctx.save();ctx.beginPath();ctx.arc(x+778*scale,y+656*scale,36*scale,0,Math.PI*2);ctx.clip();
  ctx.filter=`brightness(${1.2+pulse*2.3})`;ctx.globalAlpha=fade*(.15+.48*pulse);
  ctx.globalCompositeOperation='screen';WebArt.draw(ctx,'sekai_gameover',x,y,scale);ctx.restore();
  ctx.restore();
  return {ready:true,phase,flowerPulse:pulse,flowerCenter:[x+778*scale,y+656*scale],intactCharacter:true};
}
const api={load,draw,idle,drawGameOver,configure,cameraAt,get cameraCues(){return cameraBars.map(b=>({...b,weights:[...b.weights]}));},get ready(){return ready;},layout:{width:1920,height:1080,actorScale:.35,actorRoots:{joucho:[610,696],sekai:[1310,696]},judge:{centerX:960,bottom:438,width:200}}};
root.CourtScene=api;
})(window);

