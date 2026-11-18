(function(root){
  'use strict';
  const atlas=root.PACKED_GAME_ART;
  const pages=new Map(),tasks=new Map(),surfaces=new Map();
  function load(group){
    if(tasks.has(group))return tasks.get(group);
    const task=new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>{pages.set(group,image);resolve(image);};
      image.onerror=()=>reject(Error('未能读取画面 '+group));
      image.src='assets/packed/'+atlas.sheets[group];
    }).catch(e=>{tasks.delete(group);throw e;});
    tasks.set(group,task);
    return task;
  }
  function draw(ctx,id,x,y,scale=1){
    const frame=atlas.frames[id];
    const [group,sx,sy,sw,sh,, ,left,top,width,height]=frame;
    ctx.drawImage(pages.get(group),sx,sy,sw,sh,x+left*scale,y+top*scale,width*scale,height*scale);
  }
  function surface(id){
    if(surfaces.has(id))return surfaces.get(id);
    const f=atlas.frames[id],c=document.createElement('canvas');
    c.width=f[5];c.height=f[6];draw(c.getContext('2d'),id,0,0,1);
    surfaces.set(id,c);return c;
  }
  root.WebArt={load,draw,surface};
})(window);
