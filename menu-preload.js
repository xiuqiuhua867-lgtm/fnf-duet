(function () {
  'use strict';
  const sound = window.CourtSounds;
  const manifest = window.FNF_EXTRA_ASSETS;
  if (!sound || !manifest) return;
  sound.load(manifest, 'assets/extra/');
  // Prepare existing UI sounds without starting playback or a song download.
  void sound.warmup(['confirmMenu', 'cancelMenu', 'scrollMenu']);
})();
