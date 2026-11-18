(function () {
  'use strict';
  const viewport = document.getElementById('viewport');
  const fullButton = document.getElementById('fullscreen');
  const coarse = matchMedia('(pointer: coarse)');
  const isTouch = () => coarse.matches || (navigator.maxTouchPoints > 0 && innerWidth < 1100);
  const fullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
  const requestFull = viewport.requestFullscreen || viewport.webkitRequestFullscreen;
  let pending = false;

  function layout() {
    const visual = window.visualViewport;
    const width = Math.round(visual?.width || innerWidth);
    const height = Math.round(visual?.height || innerHeight);
    const rotated = isTouch() && height > width;
    viewport.style.setProperty('--frame-width', (rotated ? height : width) + 'px');
    viewport.style.setProperty('--frame-height', (rotated ? width : height) + 'px');
    viewport.style.setProperty('--shift-x', rotated ? width + 'px' : '0px');
    viewport.dataset.rotated = String(rotated);
    viewport.dataset.touch = String(isTouch());
    fullButton.hidden = !requestFull;
    fullButton.setAttribute('aria-label', fullscreen() ? '退出全屏' : '全屏');
  }

  async function enter(fromTouch) {
    if (pending) return;
    pending = true;
    try {
      if (!fullscreen() && requestFull) {
        try { await requestFull.call(viewport); } catch { /* The rotated layout also works inline. */ }
      }
      if (fromTouch && screen.orientation?.lock) {
        try { await screen.orientation.lock('landscape'); } catch { /* The browser controls hardware orientation. */ }
      }
    } finally {
      pending = false;
      layout();
    }
  }
  async function toggle() {
    if (!fullscreen()) return enter(isTouch());
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try { await exit?.call(document); } catch { /* The browser might have exited first. */ }
    layout();
  }
  window.PlayScreen = {toggle, enterFromGesture() { if (isTouch()) void enter(true); }};
  for (const event of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(event, layout);
  window.visualViewport?.addEventListener('resize', layout);
  coarse.addEventListener?.('change', layout);
  document.addEventListener('fullscreenchange', layout);
  document.addEventListener('webkitfullscreenchange', layout);
  layout();
})();
