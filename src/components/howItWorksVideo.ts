import Hls from 'hls.js';

const VIDEO_SELECTOR = '.video-howitworks';
const WRAPPER_SELECTOR = '.video-wrapper';
const BUTTON_SELECTOR = '.video-button';
const STYLE_ID = 'dd-howitworks-video-styles';
const INITIALIZED_ATTR = 'data-dd-video-ready';
const FADE_PENDING_ATTR = 'data-dd-video-fade-pending';
const REVEALED_ATTR = 'data-dd-video-revealed';
const CONTROLS_BOUND_ATTR = 'data-dd-video-controls-bound';
const CONTROLS_VISIBLE_ATTR = 'data-video-controls-visible';
const DEFAULT_VISIBLE_THRESHOLD = 0;
const CONTROLS_HIDE_DELAY = 3000;
const AUTOPLAY_FALLBACK_DELAY = 900;
const PLAY_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.25 3.2v9.6l7-4.8-7-4.8Z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3.25h2.25v9.5H4.5v-9.5Zm4.75 0h2.25v9.5H9.25v-9.5Z" fill="currentColor"/></svg>`;

type HlsController = {
  destroy: () => void;
  startLoad: () => void;
};

type ControlsVisibilityController = {
  releasePersistent: () => void;
  showPersistently: () => void;
};

export function initHowItWorksVideo() {
  const videos = document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR);
  if (!videos.length) return;

  injectVideoStyles();
  videos.forEach(initVideo);
}

function initVideo(video: HTMLVideoElement) {
  if (video.getAttribute(INITIALIZED_ATTR) === 'true') return;
  video.setAttribute(INITIALIZED_ATTR, 'true');

  const wrapper = video.closest<HTMLElement>(WRAPPER_SELECTOR) || video.parentElement;
  const src = video.dataset.src || video.currentSrc || video.getAttribute('src');
  if (!wrapper || !src) return;
  const source = src;

  ensureWrapperPosition(wrapper);

  const autoplay = readBoolean(video.dataset.autoplay, true);
  const visibleThreshold = readThreshold(video.dataset.visibleThreshold, DEFAULT_VISIBLE_THRESHOLD);
  const observerThresholds = Array.from(new Set([0, visibleThreshold, 0.5, 1])).sort(
    (a, b) => a - b
  );
  let isInView = false;
  let shouldAutoResume = autoplay;
  let hlsController: HlsController | undefined;
  let sourceAttached = false;
  let autoplayFallbackTimer = 0;
  let isAwaitingAutoplay = false;

  video.playsInline = true;
  video.loop = readBoolean(video.dataset.loop, video.loop);
  video.muted = readBoolean(video.dataset.muted, video.muted || autoplay);
  video.preload = readPreload(video.getAttribute('preload'));
  video.setAttribute(FADE_PENDING_ATTR, 'true');

  const button = wrapper.querySelector<HTMLElement>(BUTTON_SELECTOR);
  if (button) bindMuteButton(button, video, () => isInView && shouldAutoResume);

  const controlsVisibility = bindProgressVisibility(wrapper);

  const revealVideo = () => {
    window.requestAnimationFrame(() => {
      video.setAttribute(REVEALED_ATTR, 'true');
    });
  };

  const clearAutoplayFallbackTimer = () => {
    if (!autoplayFallbackTimer) return;
    window.clearTimeout(autoplayFallbackTimer);
    autoplayFallbackTimer = 0;
  };

  const showManualPlaybackPrompt = () => {
    clearAutoplayFallbackTimer();
    isAwaitingAutoplay = false;
    shouldAutoResume = false;
    revealVideo();
    controlsVisibility.showPersistently();
  };

  const maybeShowManualPlaybackPrompt = () => {
    if (!isAwaitingAutoplay || !isInView || !video.paused) return;
    showManualPlaybackPrompt();
  };

  const queueAutoplayFallbackCheck = () => {
    isAwaitingAutoplay = true;
    clearAutoplayFallbackTimer();
    autoplayFallbackTimer = window.setTimeout(
      maybeShowManualPlaybackPrompt,
      AUTOPLAY_FALLBACK_DELAY
    );
  };

  function attachSource() {
    if (sourceAttached) return;
    sourceAttached = true;

    if (canPlayNativeHls(video)) {
      video.src = source;
      video.load();
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }

        hls.destroy();
        hlsController = undefined;
      });

      hlsController = {
        destroy: () => hls.destroy(),
        startLoad: () => hls.startLoad(),
      };
      return;
    }

    video.src = source;
    video.load();
  }

  async function playVideo(isAutoplayAttempt: boolean) {
    attachSource();
    hlsController?.startLoad();

    if (isAutoplayAttempt) {
      queueAutoplayFallbackCheck();
    } else {
      clearAutoplayFallbackTimer();
      isAwaitingAutoplay = false;
    }

    try {
      await video.play();
    } catch (error) {
      if (isAutoplayAttempt && (isAutoplayBlocked(error) || video.paused)) {
        maybeShowManualPlaybackPrompt();
      } else if (!isAutoplayAttempt) {
        controlsVisibility.showPersistently();
      }
    }
  }

  function pauseFromViewport() {
    if (!video.paused) {
      shouldAutoResume = true;
      video.pause();
    }
  }

  const togglePlayback = () => {
    if (video.paused || video.ended) {
      shouldAutoResume = true;
      void playVideo(false);
      return;
    }

    shouldAutoResume = false;
    video.pause();
  };

  const progress = createProgressControl(wrapper, video, togglePlayback);

  video.addEventListener('click', togglePlayback);
  video.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    togglePlayback();
  });

  const syncPlaybackLabel = () => {
    video.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
  };

  video.setAttribute('role', 'button');
  video.setAttribute('tabindex', video.getAttribute('tabindex') || '0');
  video.addEventListener('play', syncPlaybackLabel);
  video.addEventListener('pause', syncPlaybackLabel);
  syncPlaybackLabel();

  video.addEventListener('playing', revealVideo, { once: true });
  video.addEventListener('playing', () => {
    clearAutoplayFallbackTimer();
    isAwaitingAutoplay = false;
    controlsVisibility.releasePersistent();
  });
  video.addEventListener('loadeddata', maybeShowManualPlaybackPrompt);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isInView = entry.isIntersecting && entry.intersectionRatio >= visibleThreshold;

        if (isInView && shouldAutoResume) {
          void playVideo(true);
        } else if (!isInView) {
          pauseFromViewport();
        }
      });
    },
    { threshold: observerThresholds }
  );

  observer.observe(video);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseFromViewport();
      return;
    }

    if (isInView && shouldAutoResume) {
      void playVideo(true);
    }
  });

  video.addEventListener('loadedmetadata', progress.update);
  video.addEventListener('durationchange', progress.update);
  video.addEventListener('timeupdate', progress.update);
  video.addEventListener('ended', progress.update);
  video.addEventListener('play', progress.syncPlayback);
  video.addEventListener('pause', progress.syncPlayback);
  progress.syncPlayback();

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearAutoplayFallbackTimer();
    hlsController?.destroy();
  });
}

function bindMuteButton(
  button: HTMLElement,
  video: HTMLVideoElement,
  shouldTryPlay: () => boolean
) {
  const muteIcon = button.querySelector<HTMLElement>('[icon-volume="mute"]');
  const unmuteIcon = button.querySelector<HTMLElement>('[icon-volume="unmute"]');

  const syncIcons = () => {
    if (muteIcon) muteIcon.style.display = video.muted ? '' : 'none';
    if (unmuteIcon) unmuteIcon.style.display = video.muted ? 'none' : 'block';
    button.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
    button.setAttribute('aria-pressed', String(!video.muted));
  };

  const toggleMute = () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    syncIcons();

    if (shouldTryPlay() && video.paused) {
      void video.play();
    }
  };

  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', button.getAttribute('tabindex') || '0');
  button.addEventListener('click', toggleMute);
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleMute();
  });

  video.addEventListener('volumechange', syncIcons);
  syncIcons();
}

function createProgressControl(
  wrapper: HTMLElement,
  video: HTMLVideoElement,
  togglePlayback: () => void
) {
  const { range, playButton } = ensureProgressElements(wrapper);
  let isScrubbing = false;
  let resumeAfterScrub = false;

  const hasDuration = () => Number.isFinite(video.duration) && video.duration > 0;

  const update = () => {
    if (isScrubbing) return;

    const canSeek = hasDuration();
    range.disabled = !canSeek;

    if (!canSeek) {
      range.value = '0';
      range.style.setProperty('--dd-video-progress', '0%');
      return;
    }

    const percent = Math.min((video.currentTime / video.duration) * 100, 100);
    const value = String(percent);
    range.value = value;
    range.style.setProperty('--dd-video-progress', `${value}%`);
  };

  const seek = () => {
    if (!hasDuration()) return;
    const percent = Number(range.value) / 100;
    video.currentTime = percent * video.duration;
    range.style.setProperty('--dd-video-progress', `${range.value}%`);
  };

  range.addEventListener('pointerdown', () => {
    isScrubbing = true;
    resumeAfterScrub = !video.paused;
  });

  range.addEventListener('input', seek);
  range.addEventListener('change', () => {
    seek();
    isScrubbing = false;
    if (resumeAfterScrub) void video.play();
  });

  range.addEventListener('pointerup', () => {
    isScrubbing = false;
    if (resumeAfterScrub) void video.play();
  });

  playButton.addEventListener('click', () => {
    togglePlayback();
  });

  const syncPlayback = () => {
    const isPaused = video.paused || video.ended;
    playButton.innerHTML = isPaused ? PLAY_ICON : PAUSE_ICON;
    playButton.setAttribute('aria-label', isPaused ? 'Play video' : 'Pause video');
  };

  update();
  return { update, syncPlayback };
}

function ensureProgressElements(wrapper: HTMLElement) {
  const existingRange = wrapper.querySelector<HTMLInputElement>('[data-video-progress-range]');
  const progress = existingRange?.closest<HTMLElement>('[data-video-progress]') || createProgress();
  const existingButton = progress.querySelector<HTMLButtonElement>('[data-video-play-toggle]');
  const playButton = existingButton || createPlayButton();
  const range = existingRange || createRange();

  if (!existingButton) {
    progress.insertBefore(playButton, progress.firstChild);
  }

  if (!existingRange) {
    progress.appendChild(range);
  }

  if (!progress.parentElement) {
    wrapper.appendChild(progress);
  }

  return { range, playButton };
}

function createProgress() {
  const progress = document.createElement('div');
  progress.className = 'dd-video-progress';
  progress.setAttribute('data-video-progress', '');
  return progress;
}

function createPlayButton() {
  const button = document.createElement('button');
  button.className = 'dd-video-play-toggle';
  button.type = 'button';
  button.setAttribute('data-video-play-toggle', '');
  button.setAttribute('aria-label', 'Play video');
  button.innerHTML = PLAY_ICON;
  return button;
}

function createRange() {
  const range = document.createElement('input');
  range.className = 'dd-video-progress-range';
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '0.1';
  range.value = '0';
  range.setAttribute('aria-label', 'Video playback progress');
  range.setAttribute('data-video-progress-range', '');
  return range;
}

function bindProgressVisibility(wrapper: HTMLElement): ControlsVisibilityController {
  if (wrapper.getAttribute(CONTROLS_BOUND_ATTR) === 'true') {
    return {
      releasePersistent: () => {
        wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, 'true');
        window.setTimeout(() => {
          wrapper.removeAttribute(CONTROLS_VISIBLE_ATTR);
        }, CONTROLS_HIDE_DELAY);
      },
      showPersistently: () => {
        wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, 'true');
      },
    };
  }

  wrapper.setAttribute(CONTROLS_BOUND_ATTR, 'true');

  let hideTimer = 0;
  let isMouseHovering = false;
  let isPersistent = false;

  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const hide = () => {
    clearHideTimer();
    if (isPersistent) return;
    wrapper.removeAttribute(CONTROLS_VISIBLE_ATTR);
  };

  const show = () => {
    wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, 'true');
    clearHideTimer();
  };

  const showTemporarily = () => {
    show();
    if (isPersistent) return;

    hideTimer = window.setTimeout(() => {
      if (!isMouseHovering) hide();
    }, CONTROLS_HIDE_DELAY);
  };

  const showPersistently = () => {
    isPersistent = true;
    show();
  };

  const releasePersistent = () => {
    if (!isPersistent) return;
    isPersistent = false;

    if (isMouseHovering) {
      show();
      return;
    }

    showTemporarily();
  };

  wrapper.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    isMouseHovering = true;
    show();
  });

  wrapper.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    isMouseHovering = false;
    showTemporarily();
  });

  wrapper.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;

    isMouseHovering = false;
    showTemporarily();
  });

  wrapper.addEventListener('focusin', () => {
    if (isMouseHovering) {
      show();
      return;
    }

    showTemporarily();
  });

  wrapper.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement) && !isMouseHovering) hide();
    }, 0);
  });

  return { releasePersistent, showPersistently };
}

function canPlayNativeHls(video: HTMLVideoElement) {
  return (
    video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    video.canPlayType('application/x-mpegURL') !== ''
  );
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === 'true' || value === '';
}

function readNumber(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readThreshold(value: string | undefined, fallback: number) {
  return Math.min(Math.max(readNumber(value, fallback), 0), 1);
}

function readPreload(value: string | null): HTMLVideoElement['preload'] {
  if (value === '' || value === 'auto' || value === 'metadata' || value === 'none') return value;
  return 'metadata';
}

function isAutoplayBlocked(error: unknown) {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

function ensureWrapperPosition(wrapper: HTMLElement) {
  if (getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }
}

function injectVideoStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.video-howitworks {
  display: block;
  cursor: pointer;
}

.video-howitworks[${FADE_PENDING_ATTR}="true"] {
  opacity: 0;
  transition: opacity 360ms ease;
}

.video-howitworks[${FADE_PENDING_ATTR}="true"][${REVEALED_ATTR}="true"] {
  opacity: 1;
}

.video-wrapper .video-controls {
  z-index: 4;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, -0.4rem, 0) scale(0.985);
  transform-origin: center top;
  transition:
    opacity 240ms ease,
    transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
}

.video-wrapper .video-button {
  cursor: pointer;
  user-select: none;
}

.dd-video-progress {
  position: absolute;
  z-index: 3;
  right: clamp(0.75rem, 2vw, 1.5rem);
  bottom: clamp(0.75rem, 2vw, 1.5rem);
  left: clamp(0.75rem, 2vw, 1.5rem);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 999rem;
  background: rgba(20, 20, 20, 0.46);
  box-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 0.65rem, 0) scale(0.985);
  transform-origin: center bottom;
  transition:
    opacity 240ms ease,
    transform 360ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 240ms ease,
    box-shadow 240ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .video-wrapper:hover .dd-video-progress,
  .video-wrapper:hover .video-controls {
    opacity: 1;
    pointer-events: auto;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.video-wrapper[data-video-controls-visible="true"] .dd-video-progress,
.video-wrapper[data-video-controls-visible="true"] .video-controls {
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(0, 0, 0) scale(1);
}

.dd-video-play-toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 0;
  border-radius: 999rem;
  color: #fff;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dd-video-play-toggle:hover,
.dd-video-play-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.16);
}

.dd-video-play-toggle:active {
  transform: scale(0.94);
}

.dd-video-play-toggle svg {
  width: 1.125rem;
  height: 1.125rem;
  display: block;
}

.dd-video-progress-range {
  --dd-video-progress: 0%;
  width: 100%;
  flex: 1 1 auto;
  min-width: 0;
  height: 0.375rem;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  border-radius: 999rem;
  outline: none;
  color: #fff;
  background: linear-gradient(
    to right,
    currentColor 0%,
    currentColor var(--dd-video-progress),
    rgba(255, 255, 255, 0.36) var(--dd-video-progress),
    rgba(255, 255, 255, 0.36) 100%
  );
  cursor: pointer;
}

.dd-video-progress-range:disabled {
  cursor: default;
  opacity: 0.45;
}

.dd-video-progress-range::-webkit-slider-runnable-track {
  height: 0.375rem;
  border-radius: 999rem;
  background: transparent;
}

.dd-video-progress-range::-webkit-slider-thumb {
  width: 0.875rem;
  height: 0.875rem;
  margin-top: -0.25rem;
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0.125rem 0.625rem rgba(0, 0, 0, 0.45);
}

.dd-video-progress-range::-moz-range-track {
  height: 0.375rem;
  border-radius: 999rem;
  background: transparent;
}

.dd-video-progress-range::-moz-range-progress {
  height: 0.375rem;
  border-radius: 999rem;
  background: currentColor;
}

.dd-video-progress-range::-moz-range-thumb {
  width: 0.875rem;
  height: 0.875rem;
  border: 0;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0.125rem 0.625rem rgba(0, 0, 0, 0.45);
}
`;

  document.head.appendChild(style);
}
