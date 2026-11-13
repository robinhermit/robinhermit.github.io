/* Animated background: a slow, cross-faded loop (media/background.mp4).
   - falls back to the still poster if autoplay is blocked or the video fails
   - stays still when the visitor prefers reduced motion */
(function () {
  var script = document.currentScript;
  if (!script) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SPEED = 1; // playback speed of the loop: 1 = as encoded (~3 cross-fades per second), 0.6 = slower, 1.5 = faster

  var base = new URL('media/', script.src);
  var root = document.documentElement;

  var video = document.createElement('video');
  video.className = 'bg-video';
  video.setAttribute('aria-hidden', 'true');
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.poster = new URL('background-poster.jpg', base).href;
  video.src = new URL('background.mp4', base).href;
  video.defaultPlaybackRate = SPEED;
  video.playbackRate = SPEED;

  // only hide the still background once the video is really playing
  video.addEventListener('playing', function () { root.classList.add('has-bg-video'); });
  video.addEventListener('error', function () { root.classList.remove('has-bg-video'); });

  document.body.insertBefore(video, document.body.firstChild);
  var attempt = video.play();
  if (attempt && attempt.catch) attempt.catch(function () {});
})();
