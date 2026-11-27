(function () {
  'use strict';
  const sound = window.CourtSounds;
  const manifest = window.FNF_EXTRA_ASSETS;
  if (!sound || !manifest) return;
  sound.load(manifest, 'assets/extra/');
  const menu=['confirmMenu','cancelMenu','scrollMenu'];
  void sound.warmup(menu,'high');
  void sound.warmup(Object.keys(manifest.sounds).filter(name=>!menu.includes(name)),'low');

  // Fetch and decode at entry. Mobile browsers may require a gesture to resume output.
  const gestures=['pointerup','keydown','click'];
  function resumeOnGesture(event){
    if(!event.isTrusted)return;
    void sound.unlock().then(running=>{
      if(running)for(const type of gestures)document.removeEventListener(type,resumeOnGesture,true);
    });
  }
  for(const type of gestures)document.addEventListener(type,resumeOnGesture,{capture:true,passive:true});
})();
