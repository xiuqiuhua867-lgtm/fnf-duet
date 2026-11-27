(() => {
  'use strict';
  const tiers = {
    easy: {id:'easy',label:'简单',speed:1,initialShare:.4,missPenalty:.022,holdDropPenalty:.010,releaseGrace:.125,
      recovery:{sick:.019,good:.012,bad:.003,shit:0},sustainRecovery:.0035,windows:{sick:.055,good:.110,bad:.150,shit:.180}},
    standard: {id:'standard',label:'标准',speed:1,initialShare:.5,missPenalty:.04,holdDropPenalty:.020,releaseGrace:.105,
      recovery:{sick:.014,good:.009,bad:.002,shit:-.005},sustainRecovery:.0025,windows:{sick:.045,good:.090,bad:.135,shit:.166}}
  };
  const tracks=window.FNFTrackMenu.tracks, variants={};
  function variantFor(id){
    if(variants[id])return variants[id];
    const track=tracks[id],media=window['SONG'+id+'_DATA'];
    return variants[id]={
      media,config:track.data.config,
      standard:{chart:track.data.chart,pose:media?.pose,maxHold:media?.maxHold,autoGain:media?.autoGain,healthBudget:track.data.config.healthBudget}
    };
  }
  let active='standard';
  function dataFor(id,mode){
    if(!tracks[id].data)return null;
    const variant=variantFor(id),rules=tiers[mode],chosen=mode==='standard'?variant.standard:window['SONG'+id+'_EASY_DATA'];
    if(!chosen||!rules)throw Error('曲目难度资源缺失');
    if(variant.media){
      variant.media.chart=chosen.chart;
      variant.media.maxHold=chosen.maxHold;
      if(id==='02'){variant.media.pose=chosen.pose;variant.media.autoGain=chosen.autoGain;}
    }
    const data={chart:chosen.chart,config:{...variant.config,scrollSpeed:870,initialShare:rules.initialShare,
      healthBudget:chosen.healthBudget,missPenalty:rules.missPenalty,holdDropPenalty:rules.holdDropPenalty,difficultyRules:rules}};
    return data;
  }
  function apply(id,mode){
    active=mode;
    document.querySelectorAll('[data-difficulty]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.difficulty===mode)));
    return dataFor(id,mode);
  }
  window.Difficulty={apply,dataFor,tiers,get id(){return active},get label(){return tiers[active].label}};
  window.COURT_DATA=apply(window.LOCAL_TRACK,'standard');
})();
