"use strict";
(() => {
  // bin/live-reload.js
  new EventSource(`${"http://localhost:3000"}/esbuild`).addEventListener("change", () => location.reload());

  // src/components/howItWorksVideo.ts
  var VIDEO_SELECTOR = ".video-howitworks";
  var WRAPPER_SELECTOR = ".video-wrapper";
  var BUTTON_SELECTOR = ".video-button";
  var STYLE_ID = "dd-howitworks-video-styles";
  var INITIALIZED_ATTR = "data-dd-video-ready";
  var FADE_PENDING_ATTR = "data-dd-video-fade-pending";
  var REVEALED_ATTR = "data-dd-video-revealed";
  var CONTROLS_BOUND_ATTR = "data-dd-video-controls-bound";
  var CONTROLS_VISIBLE_ATTR = "data-video-controls-visible";
  var DEFAULT_VISIBLE_THRESHOLD = 0;
  var CONTROLS_HIDE_DELAY = 3e3;
  var AUTOPLAY_FALLBACK_DELAY = 900;
  var HLS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1.7.1/dist/hls.min.js";
  var PLAY_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.25 3.2v9.6l7-4.8-7-4.8Z" fill="currentColor"/></svg>`;
  var PAUSE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3.25h2.25v9.5H4.5v-9.5Zm4.75 0h2.25v9.5H9.25v-9.5Z" fill="currentColor"/></svg>`;
  var hlsLoader;
  function initHowItWorksVideo() {
    const videos = document.querySelectorAll(VIDEO_SELECTOR);
    if (!videos.length) return;
    injectVideoStyles();
    videos.forEach(initVideo);
  }
  function initVideo(video) {
    if (video.getAttribute(INITIALIZED_ATTR) === "true") return;
    video.setAttribute(INITIALIZED_ATTR, "true");
    const wrapper = video.closest(WRAPPER_SELECTOR) || video.parentElement;
    const src = video.dataset.src || video.currentSrc || video.getAttribute("src");
    if (!wrapper || !src) return;
    const source = src;
    ensureWrapperPosition(wrapper);
    const autoplay = readBoolean(video.dataset.autoplay, true);
    const visibleThreshold = readThreshold(video.dataset.visibleThreshold, DEFAULT_VISIBLE_THRESHOLD);
    const observerThresholds = Array.from(/* @__PURE__ */ new Set([0, visibleThreshold, 0.5, 1])).sort(
      (a, b) => a - b
    );
    let isInView = false;
    let shouldAutoResume = autoplay;
    let hlsController;
    let autoplayFallbackTimer = 0;
    let isAwaitingAutoplay = false;
    video.playsInline = true;
    video.loop = readBoolean(video.dataset.loop, video.loop);
    video.muted = readBoolean(video.dataset.muted, video.muted || autoplay);
    video.preload = readPreload(video.getAttribute("preload"));
    video.setAttribute(FADE_PENDING_ATTR, "true");
    const button = wrapper.querySelector(BUTTON_SELECTOR);
    if (button) bindMuteButton(button, video, () => isInView && shouldAutoResume);
    const controlsVisibility = bindProgressVisibility(wrapper);
    const hlsReady = canPlayNativeHls(video) ? void 0 : loadHls();
    const revealVideo = () => {
      window.requestAnimationFrame(() => {
        video.setAttribute(REVEALED_ATTR, "true");
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
    let sourceReady;
    function attachSource() {
      sourceReady ??= (async () => {
        const HlsLib = hlsReady && await hlsReady;
        if (HlsLib?.isSupported()) {
          const hls = new HlsLib();
          hls.loadSource(source);
          hls.attachMedia(video);
          hls.on(HlsLib.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
            if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            hls.destroy();
            hlsController = void 0;
          });
          hlsController = {
            destroy: () => hls.destroy(),
            startLoad: () => hls.startLoad()
          };
          return;
        }
        video.src = source;
        video.load();
      })();
      return sourceReady;
    }
    async function playVideo(isAutoplayAttempt) {
      await attachSource();
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
    video.addEventListener("click", togglePlayback);
    video.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      togglePlayback();
    });
    const syncPlaybackLabel = () => {
      video.setAttribute("aria-label", video.paused ? "Play video" : "Pause video");
    };
    video.setAttribute("role", "button");
    video.setAttribute("tabindex", video.getAttribute("tabindex") || "0");
    video.addEventListener("play", syncPlaybackLabel);
    video.addEventListener("pause", syncPlaybackLabel);
    syncPlaybackLabel();
    video.addEventListener("playing", revealVideo, { once: true });
    video.addEventListener("playing", () => {
      clearAutoplayFallbackTimer();
      isAwaitingAutoplay = false;
      controlsVisibility.releasePersistent();
    });
    video.addEventListener("loadeddata", maybeShowManualPlaybackPrompt);
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
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        pauseFromViewport();
        return;
      }
      if (isInView && shouldAutoResume) {
        void playVideo(true);
      }
    });
    video.addEventListener("loadedmetadata", progress.update);
    video.addEventListener("durationchange", progress.update);
    video.addEventListener("timeupdate", progress.update);
    video.addEventListener("ended", progress.update);
    video.addEventListener("play", progress.syncPlayback);
    video.addEventListener("pause", progress.syncPlayback);
    progress.syncPlayback();
    window.addEventListener("pagehide", () => {
      observer.disconnect();
      clearAutoplayFallbackTimer();
      hlsController?.destroy();
    });
  }
  function bindMuteButton(button, video, shouldTryPlay) {
    const muteIcon = button.querySelector('[icon-volume="mute"]');
    const unmuteIcon = button.querySelector('[icon-volume="unmute"]');
    const syncIcons = () => {
      if (muteIcon) muteIcon.style.display = video.muted ? "" : "none";
      if (unmuteIcon) unmuteIcon.style.display = video.muted ? "none" : "block";
      button.setAttribute("aria-label", video.muted ? "Unmute video" : "Mute video");
      button.setAttribute("aria-pressed", String(!video.muted));
    };
    const toggleMute = () => {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 1;
      syncIcons();
      if (shouldTryPlay() && video.paused) {
        void video.play();
      }
    };
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", button.getAttribute("tabindex") || "0");
    button.addEventListener("click", toggleMute);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleMute();
    });
    video.addEventListener("volumechange", syncIcons);
    syncIcons();
  }
  function createProgressControl(wrapper, video, togglePlayback) {
    const { range, playButton } = ensureProgressElements(wrapper);
    let isScrubbing = false;
    let resumeAfterScrub = false;
    const hasDuration = () => Number.isFinite(video.duration) && video.duration > 0;
    const update = () => {
      if (isScrubbing) return;
      const canSeek = hasDuration();
      range.disabled = !canSeek;
      if (!canSeek) {
        range.value = "0";
        range.style.setProperty("--dd-video-progress", "0%");
        return;
      }
      const percent = Math.min(video.currentTime / video.duration * 100, 100);
      const value = String(percent);
      range.value = value;
      range.style.setProperty("--dd-video-progress", `${value}%`);
    };
    const seek = () => {
      if (!hasDuration()) return;
      const percent = Number(range.value) / 100;
      video.currentTime = percent * video.duration;
      range.style.setProperty("--dd-video-progress", `${range.value}%`);
    };
    range.addEventListener("pointerdown", () => {
      isScrubbing = true;
      resumeAfterScrub = !video.paused;
    });
    range.addEventListener("input", seek);
    range.addEventListener("change", () => {
      seek();
      isScrubbing = false;
      if (resumeAfterScrub) void video.play();
    });
    range.addEventListener("pointerup", () => {
      isScrubbing = false;
      if (resumeAfterScrub) void video.play();
    });
    playButton.addEventListener("click", () => {
      togglePlayback();
    });
    const syncPlayback = () => {
      const isPaused = video.paused || video.ended;
      playButton.innerHTML = isPaused ? PLAY_ICON : PAUSE_ICON;
      playButton.setAttribute("aria-label", isPaused ? "Play video" : "Pause video");
    };
    update();
    return { update, syncPlayback };
  }
  function ensureProgressElements(wrapper) {
    const existingRange = wrapper.querySelector("[data-video-progress-range]");
    const progress = existingRange?.closest("[data-video-progress]") || createProgress();
    const existingButton = progress.querySelector("[data-video-play-toggle]");
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
    const progress = document.createElement("div");
    progress.className = "dd-video-progress";
    progress.setAttribute("data-video-progress", "");
    return progress;
  }
  function createPlayButton() {
    const button = document.createElement("button");
    button.className = "dd-video-play-toggle";
    button.type = "button";
    button.setAttribute("data-video-play-toggle", "");
    button.setAttribute("aria-label", "Play video");
    button.innerHTML = PLAY_ICON;
    return button;
  }
  function createRange() {
    const range = document.createElement("input");
    range.className = "dd-video-progress-range";
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "0.1";
    range.value = "0";
    range.setAttribute("aria-label", "Video playback progress");
    range.setAttribute("data-video-progress-range", "");
    return range;
  }
  function bindProgressVisibility(wrapper) {
    if (wrapper.getAttribute(CONTROLS_BOUND_ATTR) === "true") {
      return {
        releasePersistent: () => {
          wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, "true");
          window.setTimeout(() => {
            wrapper.removeAttribute(CONTROLS_VISIBLE_ATTR);
          }, CONTROLS_HIDE_DELAY);
        },
        showPersistently: () => {
          wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, "true");
        }
      };
    }
    wrapper.setAttribute(CONTROLS_BOUND_ATTR, "true");
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
      wrapper.setAttribute(CONTROLS_VISIBLE_ATTR, "true");
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
    wrapper.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      isMouseHovering = true;
      show();
    });
    wrapper.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      isMouseHovering = false;
      showTemporarily();
    });
    wrapper.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      isMouseHovering = false;
      showTemporarily();
    });
    wrapper.addEventListener("focusin", () => {
      if (isMouseHovering) {
        show();
        return;
      }
      showTemporarily();
    });
    wrapper.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!wrapper.contains(document.activeElement) && !isMouseHovering) hide();
      }, 0);
    });
    return { releasePersistent, showPersistently };
  }
  function loadHls() {
    hlsLoader ??= new Promise((resolve) => {
      if (window.Hls) return resolve(window.Hls);
      const script = document.createElement("script");
      script.src = HLS_SRC;
      script.async = true;
      script.onload = () => resolve(window.Hls);
      script.onerror = () => resolve(void 0);
      document.head.appendChild(script);
    });
    return hlsLoader;
  }
  function canPlayNativeHls(video) {
    return video.canPlayType("application/vnd.apple.mpegurl") !== "" || video.canPlayType("application/x-mpegURL") !== "";
  }
  function readBoolean(value, fallback) {
    if (value === void 0) return fallback;
    return value === "true" || value === "";
  }
  function readNumber(value, fallback) {
    if (value === void 0) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function readThreshold(value, fallback) {
    return Math.min(Math.max(readNumber(value, fallback), 0), 1);
  }
  function readPreload(value) {
    if (value === "" || value === "auto" || value === "metadata" || value === "none") return value;
    return "metadata";
  }
  function isAutoplayBlocked(error) {
    return error instanceof DOMException && error.name === "NotAllowedError";
  }
  function ensureWrapperPosition(wrapper) {
    if (getComputedStyle(wrapper).position === "static") {
      wrapper.style.position = "relative";
    }
  }
  function injectVideoStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style2 = document.createElement("style");
    style2.id = STYLE_ID;
    style2.textContent = `
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
    document.head.appendChild(style2);
  }

  // src/components/repairDiagram/content.ts
  var REPAIRS = [
    {
      id: "engine",
      name: "Engine",
      cost: 6278,
      detail: "Block, head and valvetrain: the largest single repair most drivers ever face."
    },
    {
      id: "transmission",
      name: "Transmission",
      cost: 3289,
      detail: "Internal gearbox work pairs specialized labor with costly hard parts."
    },
    {
      id: "drive-axle",
      name: "Drive axle",
      cost: 1990,
      detail: "The rear differential and half shafts that carry power to the wheels."
    },
    {
      id: "ac-compressor",
      name: "A/C compressor",
      cost: 1787,
      detail: "Belt-driven pump for the cooling system: parts plus a refrigerant recharge."
    },
    {
      id: "water-pump",
      name: "Water pump",
      cost: 1273,
      detail: "Circulates coolant through the engine; often buried behind the accessory drive."
    },
    {
      id: "fuel-pump",
      name: "Fuel pump",
      cost: 1252,
      detail: "Sits inside the tank under the rear seat, so the tank usually has to come out."
    },
    {
      id: "power-steering",
      name: "Power steering motor",
      cost: 1241,
      detail: "The electric assist motor on the steering column, with its control electronics."
    },
    {
      id: "navigation",
      name: "GPS / navigation",
      cost: 1174,
      detail: "The dash display, head unit and roof antenna are built into the vehicle."
    },
    {
      id: "alternator",
      name: "Alternator",
      cost: 1091,
      detail: "Charges the battery and powers the electrics whenever the engine runs."
    }
  ];
  var PLAN_COST = 0;
  var OWN_LABEL = "Repair bill on your own";
  var PLAN_LABEL = "With Route 66";
  var HEADING = "See what one breakdown can cost.";
  var CAPTION = "Parts pricing is based on an average of actual repairs at a retail rate for parts and labor. Actual repair costs may vary by repair facility, vehicle, and location. With a Route 66 plan, covered repairs carry a $0 deductible once Route 66 approves the claim.";
  var FIGURE_LABEL = "Cutaway illustration of a crossover SUV showing where nine common repairs sit: engine, transmission, drive axle, A/C compressor, water pump, fuel pump, power steering, navigation and alternator.";
  var currency = new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  });
  var escapeHtml = (text2) => text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function renderMarkup() {
    const first = REPAIRS[0];
    const plan = first.plan ?? PLAN_COST;
    const on = (index) => index === 0 ? " is-active" : "";
    const rows = REPAIRS.map(
      (r, i) => `
      <li class="diagram_item"><div class="diagram_row${on(i)}" data-ddx-select="${r.id}">
        <div class="diagram_row-name">${escapeHtml(r.name)}</div>
        <div class="diagram_row-cost">${currency.format(r.cost)}</div>
        <p class="diagram_row-detail">${escapeHtml(r.detail)}</p>
      </div></li>`
    ).join("");
    return `
    <div class="diagram_layout" data-ddx>
      <div class="diagram_figure" data-ddx-figure></div>
      <div class="diagram_panel">
        <h2 class="diagram_title">${escapeHtml(HEADING)}</h2>
        <p class="diagram_save"><span class="diagram_save-name" data-ddx-name>${escapeHtml(first.name)}</span> \u2013 Save <span data-ddx-save>${currency.format(first.cost - plan)}</span> on a covered repair</p>
        <p class="diagram_detail" data-ddx-detail>${escapeHtml(first.detail)}</p>
        <ul role="list" class="diagram_list">${rows}</ul>
      </div>
      <p class="diagram_caption" data-ddx-caption>${escapeHtml(CAPTION)}</p>
    </div>`;
  }

  // src/components/repairDiagram/figureCss.generated.ts
  var FIGURE_CSS = '.iso{--anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;--anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;--anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;--anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;--anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;--anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;--anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;--anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);--anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;}.iso[data-theme="light"]{--anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;--anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;--anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;--anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;--anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;--anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;--anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;--anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;}.iso-svg{display:block;width:100%;height:auto;overflow:visible}.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}.iso-fill{fill:var(--anatomy-paper);stroke:none}.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}.iso-shade,.iso-top{stroke:none}.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}.iso-top{fill:var(--anatomy-top)}.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}.iso-line[data-dashed]{stroke-dasharray:3 3}.iso-line[data-flow]{stroke-dasharray:2 6}.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}.iso-dots[data-tone="hi"] circle{opacity:.85}.iso-dots[data-tone="mid"] circle{opacity:.45}.iso-dots[data-tone="lo"] circle{opacity:.22}.iso-dots[data-tone="faint"] circle{opacity:.12}.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}.tb-body{fill:var(--anatomy-shade-2);stroke:none}.tb-shine{fill:var(--anatomy-top);stroke:none}.tb-shade{fill:var(--anatomy-shade-0);stroke:none}.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}@keyframes iso-flow{to{stroke-dashoffset:-32}}@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}.iso-figure{margin:32px 0 36px}.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}.iso-plate .iso-svg{margin:0 auto}.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}.iso-key{display:inline-flex;align-items:center;gap:7px}.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}.iso-swatch-crease{stroke:var(--anatomy-lo)!important}@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}.sv-glass>.iso-fill{fill:var(--anatomy-shade-3);fill-opacity:.28}.sv-glass>.iso-shade,.sv-glass>.iso-top{fill-opacity:.22}.sv-void{fill:#c8c8c4;stroke:none}.sv-lip{fill:var(--anatomy-top);stroke:none}.it[data-glass]{pointer-events:none}.sv-shell{opacity:.34;pointer-events:none}.sv-shell-tone{stroke-width:.35;stroke-linejoin:round}.sv-shell-tone[data-tone="0"]{fill:var(--anatomy-shade-1);stroke:var(--anatomy-shade-1)}.sv-shell-tone[data-tone="1"]{fill:var(--anatomy-shade-2);stroke:var(--anatomy-shade-2)}.sv-shell-tone[data-tone="2"]{fill:var(--anatomy-shade-3);stroke:var(--anatomy-shade-3)}.sv-shell-tone[data-tone="3"]{fill:var(--anatomy-face);stroke:var(--anatomy-face)}.sv-shell-tone[data-tone="4"]{fill:var(--anatomy-face);stroke:var(--anatomy-face)}.sv-shell-glass path{fill:#8f9ba3;fill-opacity:.12;stroke:none}.sv-shell-glass,.sv-shell-sil,.sv-shell-line,.sv-shell-hidden{pointer-events:none}.sv-shell-sil{stroke:var(--anatomy-mid);stroke-width:.95px}.sv-shell-hidden{opacity:.8}.sv-flap path{fill:var(--anatomy-face);fill-opacity:.7;stroke:var(--anatomy-mid);stroke-width:.6px;cursor:pointer}.sv-flap[data-on] path{stroke:var(--anatomy-lit);stroke-width:1.15px}.sv-edge-fill{fill:var(--anatomy-shade-1);stroke:none}.sv-skin [data-seamless-skin]>.iso-shade,.sv-skin [data-seamless-skin]>.iso-top{stroke-width:.5;stroke-linejoin:round}.sv-skin [data-seamless-skin]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}.sv-skin [data-seamless-skin]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}.sv-skin [data-seamless-skin]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}.sv-skin [data-seamless-skin]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}.sv-skin [data-seamless-skin]>.iso-top{stroke:var(--anatomy-top)}.sv-trim{--anatomy-paper:#e7e6e2;--anatomy-top:#ecebe7;--anatomy-shade-0:#d3d2ce;--anatomy-shade-1:#dad9d5;--anatomy-shade-2:#e0dfdb;--anatomy-shade-3:#e6e5e1}.sv-moon>.iso-fill{fill:#8f9294;fill-opacity:.3}.sv-moon>.iso-shade,.sv-moon>.iso-top{fill:#8f9294;fill-opacity:.18}.sv-tyre{--anatomy-paper:#dededa;--anatomy-top:#e6e6e2;--anatomy-shade-0:#c9c9c5;--anatomy-shade-1:#d0d0cc;--anatomy-shade-2:#d7d7d3;--anatomy-shade-3:#deded9}.it[data-sys]{transition:opacity .4s var(--anatomy-ease)}[data-on] .iso-edge,[data-on] .tb-edge{stroke:var(--anatomy-lit);stroke-width:1.15px}[data-on] .tb-body{fill:var(--anatomy-face)}[data-on] .iso-line[data-tone="lo"],[data-on] .iso-line[data-tone="faint"]{stroke:var(--anatomy-mid)}[data-on] .iso-fill{fill:var(--anatomy-face)}[data-on] .iso-top{fill:var(--anatomy-lit-top)}[data-on] .tb-body{fill:var(--anatomy-lit-shade)}';

  // src/components/repairCostExplorer.ts
  var ROOT_SELECTOR = "[data-vsc-repair-diagram], .section_diagram .component-diagram";
  var STYLE_ID2 = "dd-repair-explorer-styles";
  var FIGURE_FILE = "repair-suv.svg";
  var ACTIVE = "is-active";
  var TOUR_STEP_MS = 3600;
  var TOUR_RESUME_MS = 9e3;
  var FIGURE_BACKUP_DELAY_MS = 4e3;
  var JSDELIVR_GH = /^https:\/\/(?:cdn|fastly|gcore)\.jsdelivr\.net\/gh\/([^/]+)\/([^/@]+)@([^/]+)\//;
  var SCRIPT_SRC = document.currentScript?.src ?? "";
  var mounted = /* @__PURE__ */ new WeakSet();
  function initRepairCostExplorer() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(mount);
  }
  function figureUrl(root) {
    const override = root.dataset.figureSrc;
    if (override) return override;
    try {
      return new URL(FIGURE_FILE, SCRIPT_SRC || window.location.href).href;
    } catch {
      return FIGURE_FILE;
    }
  }
  function figureBackupUrl(root) {
    if (root.dataset.figureSrc) return;
    const match = SCRIPT_SRC.match(JSDELIVR_GH);
    if (!match) return;
    const [, user, repo, ref] = match;
    const dir = new URL(".", SCRIPT_SRC).pathname.split(`@${ref}/`)[1] ?? "";
    return `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${dir}${FIGURE_FILE}`;
  }
  function fetchFigure(primary, backup) {
    const controller = new AbortController();
    const get = (url) => fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`figure ${response.status}`);
      return response.text();
    });
    const first = get(primary);
    if (!backup) return first;
    const second = new Promise((resolve, reject) => {
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        get(backup).then(resolve, reject);
      };
      const timer = window.setTimeout(start, FIGURE_BACKUP_DELAY_MS);
      first.then(() => window.clearTimeout(timer), start);
    });
    return Promise.any([first, second]).finally(() => controller.abort());
  }
  var text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  function readRepairs(rows, planDefault) {
    return rows.map((row) => {
      const plan = Number(row.dataset.ddxPlanCost);
      const id = row.dataset.ddxSelect ?? "";
      const known = REPAIRS.find((r) => r.id === id);
      const cost = Number(text(row.querySelector(".diagram_row-cost")).replace(/[^0-9.]/g, ""));
      return {
        id,
        name: text(row.querySelector(".diagram_row-name")) || known?.name || id,
        cost: Number.isFinite(cost) && cost > 0 ? cost : known?.cost ?? 0,
        detail: text(row.querySelector(".diagram_row-detail")) || known?.detail || "",
        plan: row.dataset.ddxPlanCost && Number.isFinite(plan) ? plan : planDefault
      };
    });
  }
  function figureMarkup(first) {
    return `
    <div class="ddx iso" data-theme="light">
      <div class="iso-plate ddx-plate">
        <div class="ddx-stage" data-ddx-stage tabindex="0" role="group" aria-label="${FIGURE_LABEL} Use the left and right arrow keys to step through them."></div>
        <div class="ddx-nav">
          <button type="button" class="ddx-step" data-ddx-step="-1" aria-label="Previous repair">\u2190</button>
          <span class="ddx-current" data-readout aria-hidden="true">${first.name}</span>
          <button type="button" class="ddx-step" data-ddx-step="1" aria-label="Next repair">\u2192</button>
        </div>
        <div class="ddx-compare">
          <div class="ddx-mini">
            <span class="ddx-mini-label">${OWN_LABEL}</span>
            <span class="ddx-mini-cost is-own" data-ddx-cost>${currency.format(first.cost)}</span>
          </div>
          <div class="ddx-mini is-plan">
            <span class="ddx-mini-label">${PLAN_LABEL}</span>
            <span class="ddx-mini-cost" data-ddx-plan>${currency.format(first.plan ?? PLAN_COST)}</span>
          </div>
        </div>
      </div>
      <p class="ddx-sr" aria-live="polite" data-ddx-live></p>
    </div>`;
  }
  function mount(root) {
    if (mounted.has(root)) return;
    mounted.add(root);
    ensureStyles();
    root.setAttribute("data-vsc-repair-mounted", "true");
    if (!root.querySelector("[data-ddx]")) root.innerHTML = renderMarkup();
    const el = root.querySelector("[data-ddx]");
    const slot = root.querySelector("[data-ddx-figure]");
    const nameEl = root.querySelector("[data-ddx-name]");
    const detailEl = root.querySelector("[data-ddx-detail]");
    const rows = Array.from(root.querySelectorAll("[data-ddx-select]"));
    if (!el || !slot || !rows.length) return;
    const repairs = readRepairs(rows, PLAN_COST);
    slot.innerHTML = figureMarkup(repairs[0]);
    const costEl = slot.querySelector("[data-ddx-cost]");
    const planEl = slot.querySelector("[data-ddx-plan]");
    const stage = slot.querySelector("[data-ddx-stage]");
    const readout = slot.querySelector("[data-readout]");
    const live = slot.querySelector("[data-ddx-live]");
    const steppers = Array.from(slot.querySelectorAll("[data-ddx-step]"));
    const saveEl = root.querySelector("[data-ddx-save]");
    if (!stage || !costEl) return;
    rows.forEach((row, index) => {
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      const detail = row.querySelector(".diagram_row-detail");
      if (detail) {
        detail.id ||= `ddx-detail-${repairs[index].id}`;
        row.setAttribute("aria-describedby", detail.id);
      }
    });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let items = [];
    let active = repairs[0].id;
    let shownCost = repairs[0].cost;
    let costFrame = 0;
    let tourTimer = 0;
    let resumeTimer = 0;
    let inView = false;
    let touched = false;
    const paintFigure = () => {
      items.forEach((item) => {
        const on = item.getAttribute("data-sys") === active;
        item.toggleAttribute("data-on", on);
        item.querySelectorAll(".iso-solid").forEach((solid) => solid.toggleAttribute("data-lit", on));
      });
    };
    const tweenCost = (to) => {
      cancelAnimationFrame(costFrame);
      const from = shownCost;
      if (still.matches || from === to) {
        shownCost = to;
        costEl.textContent = currency.format(to);
        return;
      }
      const start = performance.now();
      const step2 = (now) => {
        const t = Math.min(1, (now - start) / 520);
        const eased = 1 - (1 - t) ** 3;
        shownCost = Math.round(from + (to - from) * eased);
        costEl.textContent = currency.format(shownCost);
        if (t < 1) costFrame = requestAnimationFrame(step2);
      };
      costFrame = requestAnimationFrame(step2);
    };
    const select = (id, { announce = false, force = false } = {}) => {
      if (id === active && !force) return;
      const repair = repairs.find((r) => r.id === id);
      if (!repair) return;
      active = id;
      const { cost, name } = repair;
      el.dataset.active = id;
      if (nameEl) nameEl.textContent = name;
      if (detailEl) detailEl.textContent = repair.detail;
      tweenCost(cost);
      if (planEl) planEl.textContent = currency.format(repair.plan ?? PLAN_COST);
      if (saveEl) saveEl.textContent = currency.format(cost - (repair.plan ?? PLAN_COST));
      if (readout) readout.textContent = name;
      rows.forEach((row) => {
        const on = row.dataset.ddxSelect === id;
        row.classList.toggle(ACTIVE, on);
        row.setAttribute("aria-pressed", String(on));
      });
      paintFigure();
      if (announce && live)
        live.textContent = `${name}: ${currency.format(cost)} average repair cost, ${currency.format(repair.plan ?? PLAN_COST)} with a Route 66 plan.`;
    };
    const step = (by) => {
      const index = repairs.findIndex((r) => r.id === active);
      select(repairs[(Math.max(0, index) + by + repairs.length) % repairs.length].id, {
        announce: true
      });
    };
    const stopTour = () => {
      window.clearInterval(tourTimer);
      tourTimer = 0;
    };
    const startTour = () => {
      stopTour();
      if (still.matches || !inView || touched) return;
      tourTimer = window.setInterval(() => step(1), TOUR_STEP_MS);
    };
    const pauseTour = () => {
      touched = true;
      stopTour();
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        touched = false;
        startTour();
      }, TOUR_RESUME_MS);
    };
    rows.forEach((row) => {
      const id = row.dataset.ddxSelect ?? "";
      row.addEventListener("click", () => {
        pauseTour();
        select(id, { announce: true });
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pauseTour();
        select(id, { announce: true });
      });
      row.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse") return;
        pauseTour();
        select(id);
      });
      row.addEventListener("focus", () => {
        pauseTour();
        select(id);
      });
    });
    const pickAt = (target) => {
      const sys = target?.closest?.("[data-sys]")?.getAttribute("data-sys");
      if (sys && sys !== active) select(sys, { announce: true });
      return Boolean(sys);
    };
    stage.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      if (pickAt(event.target)) pauseTour();
    });
    stage.addEventListener("click", (event) => {
      if (pickAt(event.target)) pauseTour();
    });
    steppers.forEach(
      (button) => button.addEventListener("click", () => {
        pauseTour();
        step(Number(button.dataset.ddxStep) || 1);
      })
    );
    stage.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      pauseTour();
      step(event.key === "ArrowRight" ? 1 : -1);
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting;
          if (inView) startTour();
          else stopTour();
        },
        { threshold: 0.35 }
      ).observe(el);
    }
    still.addEventListener?.("change", () => still.matches ? stopTour() : startTour());
    select(active, { force: true });
    el.dataset.figure = "loading";
    fetchFigure(figureUrl(root), figureBackupUrl(root)).then((svg) => {
      stage.innerHTML = svg;
      stage.querySelector("svg")?.setAttribute("focusable", "false");
      items = Array.from(stage.querySelectorAll("[data-sys]"));
      el.dataset.figure = "ready";
      paintFigure();
    }).catch(() => {
      el.dataset.figure = "error";
    });
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID2)) return;
    const style2 = document.createElement("style");
    style2.id = STYLE_ID2;
    style2.textContent = FIGURE_CSS + FIGURE_CARD_CSS;
    document.head.appendChild(style2);
  }
  var FIGURE_CARD_CSS = `
.ddx.iso[data-theme="light"]{--anatomy-card:var(--base-color-brand--off-white-2-f5f4f1,#f5f4f1);--anatomy-paper:var(--anatomy-card);--anatomy-lit:#d94b16;--anatomy-halo-opacity:.18;--ddx-line:#dfdcd5;background:transparent;color:var(--anatomy-text);font-family:Inter,Arial,sans-serif;text-align:left}
.ddx *{box-sizing:border-box}
.ddx .iso-plate{padding:40px 18px 28px;border-radius:16px;background:transparent;box-shadow:none}
.ddx-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
.ddx-current{min-width:12ch;color:var(--anatomy-strong);font-size:17px;font-weight:600;line-height:1.2;letter-spacing:.01em;text-align:center}
.ddx-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:440px;margin:14px auto 0}
.ddx-mini{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--ddx-line);border-radius:12px;background:#fff}
.ddx-mini.is-plan{border-color:transparent;background:rgba(217,75,22,.08)}
.ddx-mini-label{color:var(--anatomy-muted);font-size:12.5px;font-weight:500;line-height:1.2}
.ddx-mini-cost{color:var(--anatomy-lit);font-size:26px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ddx-mini-cost.is-own{color:var(--anatomy-strong);opacity:.55;text-decoration:line-through;text-decoration-thickness:2px}
.ddx-step{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;flex:none;width:44px;height:44px;border:1px solid var(--ddx-line);border-radius:50%;background:#fff;color:var(--anatomy-strong);font-size:19px;line-height:1;cursor:pointer;transition:background-color .2s var(--anatomy-ease),border-color .2s var(--anatomy-ease),color .2s var(--anatomy-ease)}
.ddx-step:hover{border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ddx-step:focus-visible{outline:2px solid var(--anatomy-strong);outline-offset:2px}
.ddx-stage{position:relative;outline:none;aspect-ratio:960/540;cursor:default}
.ddx-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-strong);border-radius:8px}
.ddx-stage svg{display:block;width:100%;height:auto}
.ddx-stage [data-sys]{cursor:pointer}
[data-figure="error"] .ddx-stage{display:none}
[data-figure="loading"] .ddx-stage::after{content:"";position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid var(--ddx-line);border-top-color:var(--anatomy-muted);border-radius:50%;opacity:0;animation:ddx-spin .8s linear infinite,ddx-appear .2s .4s forwards}
@keyframes ddx-spin{to{transform:rotate(360deg)}}
@keyframes ddx-appear{to{opacity:1}}
.ddx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-ddx-select]:focus-visible{outline:2px solid #18181a;outline-offset:2px}
@media (max-width:767px){.ddx .iso-plate{padding:24px 6px 22px;overflow:hidden}.ddx .ddx-stage svg{width:116%;max-width:none;margin:0 0 0 -8%}.ddx-current{font-size:15px}.ddx-compare{margin:12px 8px 0}.ddx-mini{padding:10px 12px}.ddx-mini-cost{font-size:22px}}
`;

  // src/components/savingsCalculator.ts
  var CALCULATOR_SELECTOR = "[data-savings-calculator]";
  var INPUT_SELECTOR = "[data-savings-input]";
  var DECREASE_SELECTOR = "[data-savings-decrease]";
  var INCREASE_SELECTOR = "[data-savings-increase]";
  var VALUE_SELECTOR = "[data-savings-value]";
  var VEHICLE_LABEL_SELECTOR = "[data-savings-vehicle-label]";
  var ANNUAL_SELECTOR = "[data-savings-annual]";
  var MONTHLY_SELECTOR = "[data-savings-monthly]";
  var DESCRIPTION_SELECTOR = "[data-savings-description]";
  var FILL_SELECTOR = "[data-savings-fill]";
  var HANDLE_SELECTOR = "[data-savings-handle]";
  var PROGRESS_ATTR = "--savings-progress";
  var SLIDER_EDGE_OFFSET = 16;
  var DEFAULT_MIN = 1;
  var DEFAULT_MAX = 7;
  var DEFAULT_VALUE = 3;
  var DEFAULT_ANNUAL_SAVINGS_PER_VEHICLE = 180;
  var initializedCalculators = /* @__PURE__ */ new WeakSet();
  var currencyFormatter = new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  });
  function initSavingsCalculator() {
    const calculators = document.querySelectorAll(CALCULATOR_SELECTOR);
    if (!calculators.length) return;
    calculators.forEach(initCalculator);
  }
  function initCalculator(calculator) {
    if (initializedCalculators.has(calculator)) return;
    const input = calculator.querySelector(INPUT_SELECTOR);
    if (!input) return;
    initializedCalculators.add(calculator);
    const decreaseButton = calculator.querySelector(DECREASE_SELECTOR);
    const increaseButton = calculator.querySelector(INCREASE_SELECTOR);
    const valueElement = calculator.querySelector(VALUE_SELECTOR);
    const vehicleLabelElement = calculator.querySelector(VEHICLE_LABEL_SELECTOR);
    const annualElement = calculator.querySelector(ANNUAL_SELECTOR);
    const monthlyElement = calculator.querySelector(MONTHLY_SELECTOR);
    const descriptionElement = calculator.querySelector(DESCRIPTION_SELECTOR);
    const fillElement = calculator.querySelector(FILL_SELECTOR);
    const handleElement = calculator.querySelector(HANDLE_SELECTOR);
    const min2 = readNumber2(input.min || calculator.dataset.savingsMin, DEFAULT_MIN);
    const max2 = readNumber2(input.max || calculator.dataset.savingsMax, DEFAULT_MAX);
    const savingsPerVehicle = readNumber2(
      calculator.dataset.savingsPerYear,
      DEFAULT_ANNUAL_SAVINGS_PER_VEHICLE
    );
    input.min = String(min2);
    input.max = String(max2);
    input.step = input.step || "1";
    configureStepControl(decreaseButton);
    configureStepControl(increaseButton);
    const render = (nextValue) => {
      const vehicles = clamp(Math.round(nextValue), min2, max2);
      const annualSavings = vehicles * savingsPerVehicle;
      const monthlySavings = annualSavings / 12;
      const progress = max2 === min2 ? 100 : (vehicles - min2) / (max2 - min2) * 100;
      const visualPosition = getSliderVisualPosition(progress);
      input.value = String(vehicles);
      input.setAttribute("aria-valuetext", `${vehicles} ${vehicleCopy(vehicles)}`);
      calculator.style.setProperty(PROGRESS_ATTR, `${progress}%`);
      if (fillElement) fillElement.style.width = visualPosition;
      if (handleElement) handleElement.style.left = visualPosition;
      if (valueElement) valueElement.textContent = String(vehicles);
      if (vehicleLabelElement) vehicleLabelElement.textContent = vehicleCopy(vehicles);
      if (annualElement) annualElement.textContent = currencyFormatter.format(annualSavings);
      if (monthlyElement) monthlyElement.textContent = currencyFormatter.format(monthlySavings);
      if (descriptionElement) {
        descriptionElement.textContent = `${currencyFormatter.format(
          annualSavings
        )} is the estimated annual premium savings for ${vehicles} ${vehicleCopy(
          vehicles
        )} when moving from a $500 to a $1,000 collision deductible.`;
      }
      syncButton(decreaseButton, vehicles <= min2);
      syncButton(increaseButton, vehicles >= max2);
    };
    bindStepControl(decreaseButton, () => render(Number(input.value) - 1));
    bindStepControl(increaseButton, () => render(Number(input.value) + 1));
    input.addEventListener("input", () => render(Number(input.value)));
    input.addEventListener("change", () => render(Number(input.value)));
    render(readNumber2(input.value, DEFAULT_VALUE));
  }
  function readNumber2(value, fallback) {
    if (!value) return fallback;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }
  function clamp(value, min2, max2) {
    return Math.min(Math.max(value, min2), max2);
  }
  function getSliderVisualPosition(progress) {
    const boundedProgress = clamp(progress, 0, 100);
    const offset = SLIDER_EDGE_OFFSET - SLIDER_EDGE_OFFSET * 2 * (boundedProgress / 100);
    const sign2 = offset < 0 ? "-" : "+";
    return `calc(${boundedProgress}% ${sign2} ${Math.abs(offset).toFixed(2)}px)`;
  }
  function syncButton(button, isDisabled) {
    if (!button) return;
    if (isDisableableControl(button)) button.disabled = isDisabled;
    button.classList.toggle("dd-step-disabled", isDisabled);
    button.classList.toggle("ddf-step-disabled", isDisabled);
    button.classList.toggle("ddx-step-disabled", isDisabled);
    button.classList.toggle("ddz-step-disabled", isDisabled);
    button.classList.toggle("ddv-step-disabled", isDisabled);
    button.setAttribute("aria-disabled", String(isDisabled));
  }
  function configureStepControl(control) {
    if (!control) return;
    if (control instanceof HTMLButtonElement) {
      control.type = "button";
    }
    if (control instanceof HTMLInputElement && isInputStepButton(control)) {
      control.type = "button";
    }
    if (!isNativeButtonControl(control)) {
      control.setAttribute("role", "button");
    }
    if (!isNaturallyFocusable(control)) {
      control.setAttribute("tabindex", "0");
    }
  }
  function bindStepControl(control, activate) {
    if (!control) return;
    control.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      focusControl(control);
      if (isStepControlDisabled(control)) return;
      activate();
    });
    control.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      if (isStepControlDisabled(control)) return;
      activate();
    });
  }
  function focusControl(control) {
    if (!isNaturallyFocusable(control)) return;
    control.focus({ preventScroll: true });
  }
  function isStepControlDisabled(control) {
    return control.getAttribute("aria-disabled") === "true";
  }
  function isDisableableControl(control) {
    return control instanceof HTMLButtonElement || control instanceof HTMLInputElement;
  }
  function isInputStepButton(input) {
    return input.type === "button" || input.type === "submit";
  }
  function isNativeButtonControl(control) {
    return control instanceof HTMLButtonElement || control instanceof HTMLInputElement && isInputStepButton(control);
  }
  function isNaturallyFocusable(control) {
    return control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLAnchorElement && control.hasAttribute("href") || control.tabIndex >= 0;
  }
  function vehicleCopy(count) {
    return count === 1 ? "insured vehicle" : "insured vehicles";
  }

  // node_modules/.pnpm/@splidejs+splide@4.1.4/node_modules/@splidejs/splide/dist/js/splide.esm.js
  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }
  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    Object.defineProperty(Constructor, "prototype", { writable: false });
    return Constructor;
  }
  var MEDIA_PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
  var CREATED = 1;
  var MOUNTED = 2;
  var IDLE = 3;
  var MOVING = 4;
  var SCROLLING = 5;
  var DRAGGING = 6;
  var DESTROYED = 7;
  var STATES = {
    CREATED,
    MOUNTED,
    IDLE,
    MOVING,
    SCROLLING,
    DRAGGING,
    DESTROYED
  };
  function empty(array) {
    array.length = 0;
  }
  function slice(arrayLike, start, end) {
    return Array.prototype.slice.call(arrayLike, start, end);
  }
  function apply(func) {
    return func.bind.apply(func, [null].concat(slice(arguments, 1)));
  }
  var nextTick = setTimeout;
  var noop = function noop2() {
  };
  function raf(func) {
    return requestAnimationFrame(func);
  }
  function typeOf(type, subject) {
    return typeof subject === type;
  }
  function isObject(subject) {
    return !isNull(subject) && typeOf("object", subject);
  }
  var isArray = Array.isArray;
  var isFunction = apply(typeOf, "function");
  var isString = apply(typeOf, "string");
  var isUndefined = apply(typeOf, "undefined");
  function isNull(subject) {
    return subject === null;
  }
  function isHTMLElement(subject) {
    try {
      return subject instanceof (subject.ownerDocument.defaultView || window).HTMLElement;
    } catch (e) {
      return false;
    }
  }
  function toArray(value) {
    return isArray(value) ? value : [value];
  }
  function forEach(values, iteratee) {
    toArray(values).forEach(iteratee);
  }
  function includes(array, value) {
    return array.indexOf(value) > -1;
  }
  function push(array, items) {
    array.push.apply(array, toArray(items));
    return array;
  }
  function toggleClass(elm, classes, add) {
    if (elm) {
      forEach(classes, function(name) {
        if (name) {
          elm.classList[add ? "add" : "remove"](name);
        }
      });
    }
  }
  function addClass(elm, classes) {
    toggleClass(elm, isString(classes) ? classes.split(" ") : classes, true);
  }
  function append(parent, children2) {
    forEach(children2, parent.appendChild.bind(parent));
  }
  function before(nodes, ref) {
    forEach(nodes, function(node) {
      var parent = (ref || node).parentNode;
      if (parent) {
        parent.insertBefore(node, ref);
      }
    });
  }
  function matches(elm, selector) {
    return isHTMLElement(elm) && (elm["msMatchesSelector"] || elm.matches).call(elm, selector);
  }
  function children(parent, selector) {
    var children2 = parent ? slice(parent.children) : [];
    return selector ? children2.filter(function(child2) {
      return matches(child2, selector);
    }) : children2;
  }
  function child(parent, selector) {
    return selector ? children(parent, selector)[0] : parent.firstElementChild;
  }
  var ownKeys = Object.keys;
  function forOwn(object, iteratee, right) {
    if (object) {
      (right ? ownKeys(object).reverse() : ownKeys(object)).forEach(function(key) {
        key !== "__proto__" && iteratee(object[key], key);
      });
    }
    return object;
  }
  function assign(object) {
    slice(arguments, 1).forEach(function(source) {
      forOwn(source, function(value, key) {
        object[key] = source[key];
      });
    });
    return object;
  }
  function merge(object) {
    slice(arguments, 1).forEach(function(source) {
      forOwn(source, function(value, key) {
        if (isArray(value)) {
          object[key] = value.slice();
        } else if (isObject(value)) {
          object[key] = merge({}, isObject(object[key]) ? object[key] : {}, value);
        } else {
          object[key] = value;
        }
      });
    });
    return object;
  }
  function omit(object, keys) {
    forEach(keys || ownKeys(object), function(key) {
      delete object[key];
    });
  }
  function removeAttribute(elms, attrs) {
    forEach(elms, function(elm) {
      forEach(attrs, function(attr) {
        elm && elm.removeAttribute(attr);
      });
    });
  }
  function setAttribute(elms, attrs, value) {
    if (isObject(attrs)) {
      forOwn(attrs, function(value2, name) {
        setAttribute(elms, name, value2);
      });
    } else {
      forEach(elms, function(elm) {
        isNull(value) || value === "" ? removeAttribute(elm, attrs) : elm.setAttribute(attrs, String(value));
      });
    }
  }
  function create(tag, attrs, parent) {
    var elm = document.createElement(tag);
    if (attrs) {
      isString(attrs) ? addClass(elm, attrs) : setAttribute(elm, attrs);
    }
    parent && append(parent, elm);
    return elm;
  }
  function style(elm, prop, value) {
    if (isUndefined(value)) {
      return getComputedStyle(elm)[prop];
    }
    if (!isNull(value)) {
      elm.style[prop] = "" + value;
    }
  }
  function display(elm, display2) {
    style(elm, "display", display2);
  }
  function focus(elm) {
    elm["setActive"] && elm["setActive"]() || elm.focus({
      preventScroll: true
    });
  }
  function getAttribute(elm, attr) {
    return elm.getAttribute(attr);
  }
  function hasClass(elm, className) {
    return elm && elm.classList.contains(className);
  }
  function rect(target) {
    return target.getBoundingClientRect();
  }
  function remove(nodes) {
    forEach(nodes, function(node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }
  function parseHtml(html) {
    return child(new DOMParser().parseFromString(html, "text/html").body);
  }
  function prevent(e, stopPropagation) {
    e.preventDefault();
    if (stopPropagation) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
  function query(parent, selector) {
    return parent && parent.querySelector(selector);
  }
  function queryAll(parent, selector) {
    return selector ? slice(parent.querySelectorAll(selector)) : [];
  }
  function removeClass(elm, classes) {
    toggleClass(elm, classes, false);
  }
  function timeOf(e) {
    return e.timeStamp;
  }
  function unit(value) {
    return isString(value) ? value : value ? value + "px" : "";
  }
  var PROJECT_CODE = "splide";
  var DATA_ATTRIBUTE = "data-" + PROJECT_CODE;
  function assert(condition, message) {
    if (!condition) {
      throw new Error("[" + PROJECT_CODE + "] " + (message || ""));
    }
  }
  var min = Math.min;
  var max = Math.max;
  var floor = Math.floor;
  var ceil = Math.ceil;
  var abs = Math.abs;
  function approximatelyEqual(x, y, epsilon) {
    return abs(x - y) < epsilon;
  }
  function between(number, x, y, exclusive) {
    var minimum = min(x, y);
    var maximum = max(x, y);
    return exclusive ? minimum < number && number < maximum : minimum <= number && number <= maximum;
  }
  function clamp2(number, x, y) {
    var minimum = min(x, y);
    var maximum = max(x, y);
    return min(max(minimum, number), maximum);
  }
  function sign(x) {
    return +(x > 0) - +(x < 0);
  }
  function format(string, replacements) {
    forEach(replacements, function(replacement) {
      string = string.replace("%s", "" + replacement);
    });
    return string;
  }
  function pad(number) {
    return number < 10 ? "0" + number : "" + number;
  }
  var ids = {};
  function uniqueId(prefix) {
    return "" + prefix + pad(ids[prefix] = (ids[prefix] || 0) + 1);
  }
  function EventBinder() {
    var listeners = [];
    function bind(targets, events, callback, options) {
      forEachEvent(targets, events, function(target, event, namespace) {
        var isEventTarget = "addEventListener" in target;
        var remover = isEventTarget ? target.removeEventListener.bind(target, event, callback, options) : target["removeListener"].bind(target, callback);
        isEventTarget ? target.addEventListener(event, callback, options) : target["addListener"](callback);
        listeners.push([target, event, namespace, callback, remover]);
      });
    }
    function unbind(targets, events, callback) {
      forEachEvent(targets, events, function(target, event, namespace) {
        listeners = listeners.filter(function(listener) {
          if (listener[0] === target && listener[1] === event && listener[2] === namespace && (!callback || listener[3] === callback)) {
            listener[4]();
            return false;
          }
          return true;
        });
      });
    }
    function dispatch(target, type, detail) {
      var e;
      var bubbles = true;
      if (typeof CustomEvent === "function") {
        e = new CustomEvent(type, {
          bubbles,
          detail
        });
      } else {
        e = document.createEvent("CustomEvent");
        e.initCustomEvent(type, bubbles, false, detail);
      }
      target.dispatchEvent(e);
      return e;
    }
    function forEachEvent(targets, events, iteratee) {
      forEach(targets, function(target) {
        target && forEach(events, function(events2) {
          events2.split(" ").forEach(function(eventNS) {
            var fragment = eventNS.split(".");
            iteratee(target, fragment[0], fragment[1]);
          });
        });
      });
    }
    function destroy() {
      listeners.forEach(function(data) {
        data[4]();
      });
      empty(listeners);
    }
    return {
      bind,
      unbind,
      dispatch,
      destroy
    };
  }
  var EVENT_MOUNTED = "mounted";
  var EVENT_READY = "ready";
  var EVENT_MOVE = "move";
  var EVENT_MOVED = "moved";
  var EVENT_CLICK = "click";
  var EVENT_ACTIVE = "active";
  var EVENT_INACTIVE = "inactive";
  var EVENT_VISIBLE = "visible";
  var EVENT_HIDDEN = "hidden";
  var EVENT_REFRESH = "refresh";
  var EVENT_UPDATED = "updated";
  var EVENT_RESIZE = "resize";
  var EVENT_RESIZED = "resized";
  var EVENT_DRAG = "drag";
  var EVENT_DRAGGING = "dragging";
  var EVENT_DRAGGED = "dragged";
  var EVENT_SCROLL = "scroll";
  var EVENT_SCROLLED = "scrolled";
  var EVENT_OVERFLOW = "overflow";
  var EVENT_DESTROY = "destroy";
  var EVENT_ARROWS_MOUNTED = "arrows:mounted";
  var EVENT_ARROWS_UPDATED = "arrows:updated";
  var EVENT_PAGINATION_MOUNTED = "pagination:mounted";
  var EVENT_PAGINATION_UPDATED = "pagination:updated";
  var EVENT_NAVIGATION_MOUNTED = "navigation:mounted";
  var EVENT_AUTOPLAY_PLAY = "autoplay:play";
  var EVENT_AUTOPLAY_PLAYING = "autoplay:playing";
  var EVENT_AUTOPLAY_PAUSE = "autoplay:pause";
  var EVENT_LAZYLOAD_LOADED = "lazyload:loaded";
  var EVENT_SLIDE_KEYDOWN = "sk";
  var EVENT_SHIFTED = "sh";
  var EVENT_END_INDEX_CHANGED = "ei";
  function EventInterface(Splide2) {
    var bus = Splide2 ? Splide2.event.bus : document.createDocumentFragment();
    var binder = EventBinder();
    function on(events, callback) {
      binder.bind(bus, toArray(events).join(" "), function(e) {
        callback.apply(callback, isArray(e.detail) ? e.detail : []);
      });
    }
    function emit(event) {
      binder.dispatch(bus, event, slice(arguments, 1));
    }
    if (Splide2) {
      Splide2.event.on(EVENT_DESTROY, binder.destroy);
    }
    return assign(binder, {
      bus,
      on,
      off: apply(binder.unbind, bus),
      emit
    });
  }
  function RequestInterval(interval, onInterval, onUpdate, limit) {
    var now = Date.now;
    var startTime;
    var rate = 0;
    var id;
    var paused = true;
    var count = 0;
    function update() {
      if (!paused) {
        rate = interval ? min((now() - startTime) / interval, 1) : 1;
        onUpdate && onUpdate(rate);
        if (rate >= 1) {
          onInterval();
          startTime = now();
          if (limit && ++count >= limit) {
            return pause();
          }
        }
        id = raf(update);
      }
    }
    function start(resume) {
      resume || cancel();
      startTime = now() - (resume ? rate * interval : 0);
      paused = false;
      id = raf(update);
    }
    function pause() {
      paused = true;
    }
    function rewind() {
      startTime = now();
      rate = 0;
      if (onUpdate) {
        onUpdate(rate);
      }
    }
    function cancel() {
      id && cancelAnimationFrame(id);
      rate = 0;
      id = 0;
      paused = true;
    }
    function set(time) {
      interval = time;
    }
    function isPaused() {
      return paused;
    }
    return {
      start,
      rewind,
      pause,
      cancel,
      set,
      isPaused
    };
  }
  function State(initialState) {
    var state = initialState;
    function set(value) {
      state = value;
    }
    function is(states) {
      return includes(toArray(states), state);
    }
    return {
      set,
      is
    };
  }
  function Throttle(func, duration) {
    var interval = RequestInterval(duration || 0, func, null, 1);
    return function() {
      interval.isPaused() && interval.start();
    };
  }
  function Media(Splide2, Components2, options) {
    var state = Splide2.state;
    var breakpoints = options.breakpoints || {};
    var reducedMotion = options.reducedMotion || {};
    var binder = EventBinder();
    var queries = [];
    function setup() {
      var isMin = options.mediaQuery === "min";
      ownKeys(breakpoints).sort(function(n, m) {
        return isMin ? +n - +m : +m - +n;
      }).forEach(function(key) {
        register(breakpoints[key], "(" + (isMin ? "min" : "max") + "-width:" + key + "px)");
      });
      register(reducedMotion, MEDIA_PREFERS_REDUCED_MOTION);
      update();
    }
    function destroy(completely) {
      if (completely) {
        binder.destroy();
      }
    }
    function register(options2, query2) {
      var queryList = matchMedia(query2);
      binder.bind(queryList, "change", update);
      queries.push([options2, queryList]);
    }
    function update() {
      var destroyed = state.is(DESTROYED);
      var direction = options.direction;
      var merged = queries.reduce(function(merged2, entry) {
        return merge(merged2, entry[1].matches ? entry[0] : {});
      }, {});
      omit(options);
      set(merged);
      if (options.destroy) {
        Splide2.destroy(options.destroy === "completely");
      } else if (destroyed) {
        destroy(true);
        Splide2.mount();
      } else {
        direction !== options.direction && Splide2.refresh();
      }
    }
    function reduce(enable) {
      if (matchMedia(MEDIA_PREFERS_REDUCED_MOTION).matches) {
        enable ? merge(options, reducedMotion) : omit(options, ownKeys(reducedMotion));
      }
    }
    function set(opts, base, notify) {
      merge(options, opts);
      base && merge(Object.getPrototypeOf(options), opts);
      if (notify || !state.is(CREATED)) {
        Splide2.emit(EVENT_UPDATED, options);
      }
    }
    return {
      setup,
      destroy,
      reduce,
      set
    };
  }
  var ARROW = "Arrow";
  var ARROW_LEFT = ARROW + "Left";
  var ARROW_RIGHT = ARROW + "Right";
  var ARROW_UP = ARROW + "Up";
  var ARROW_DOWN = ARROW + "Down";
  var RTL = "rtl";
  var TTB = "ttb";
  var ORIENTATION_MAP = {
    width: ["height"],
    left: ["top", "right"],
    right: ["bottom", "left"],
    x: ["y"],
    X: ["Y"],
    Y: ["X"],
    ArrowLeft: [ARROW_UP, ARROW_RIGHT],
    ArrowRight: [ARROW_DOWN, ARROW_LEFT]
  };
  function Direction(Splide2, Components2, options) {
    function resolve(prop, axisOnly, direction) {
      direction = direction || options.direction;
      var index = direction === RTL && !axisOnly ? 1 : direction === TTB ? 0 : -1;
      return ORIENTATION_MAP[prop] && ORIENTATION_MAP[prop][index] || prop.replace(/width|left|right/i, function(match, offset) {
        var replacement = ORIENTATION_MAP[match.toLowerCase()][index] || match;
        return offset > 0 ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
      });
    }
    function orient(value) {
      return value * (options.direction === RTL ? 1 : -1);
    }
    return {
      resolve,
      orient
    };
  }
  var ROLE = "role";
  var TAB_INDEX = "tabindex";
  var DISABLED = "disabled";
  var ARIA_PREFIX = "aria-";
  var ARIA_CONTROLS = ARIA_PREFIX + "controls";
  var ARIA_CURRENT = ARIA_PREFIX + "current";
  var ARIA_SELECTED = ARIA_PREFIX + "selected";
  var ARIA_LABEL = ARIA_PREFIX + "label";
  var ARIA_LABELLEDBY = ARIA_PREFIX + "labelledby";
  var ARIA_HIDDEN = ARIA_PREFIX + "hidden";
  var ARIA_ORIENTATION = ARIA_PREFIX + "orientation";
  var ARIA_ROLEDESCRIPTION = ARIA_PREFIX + "roledescription";
  var ARIA_LIVE = ARIA_PREFIX + "live";
  var ARIA_BUSY = ARIA_PREFIX + "busy";
  var ARIA_ATOMIC = ARIA_PREFIX + "atomic";
  var ALL_ATTRIBUTES = [ROLE, TAB_INDEX, DISABLED, ARIA_CONTROLS, ARIA_CURRENT, ARIA_LABEL, ARIA_LABELLEDBY, ARIA_HIDDEN, ARIA_ORIENTATION, ARIA_ROLEDESCRIPTION];
  var CLASS_PREFIX = PROJECT_CODE + "__";
  var STATUS_CLASS_PREFIX = "is-";
  var CLASS_ROOT = PROJECT_CODE;
  var CLASS_TRACK = CLASS_PREFIX + "track";
  var CLASS_LIST = CLASS_PREFIX + "list";
  var CLASS_SLIDE = CLASS_PREFIX + "slide";
  var CLASS_CLONE = CLASS_SLIDE + "--clone";
  var CLASS_CONTAINER = CLASS_SLIDE + "__container";
  var CLASS_ARROWS = CLASS_PREFIX + "arrows";
  var CLASS_ARROW = CLASS_PREFIX + "arrow";
  var CLASS_ARROW_PREV = CLASS_ARROW + "--prev";
  var CLASS_ARROW_NEXT = CLASS_ARROW + "--next";
  var CLASS_PAGINATION = CLASS_PREFIX + "pagination";
  var CLASS_PAGINATION_PAGE = CLASS_PAGINATION + "__page";
  var CLASS_PROGRESS = CLASS_PREFIX + "progress";
  var CLASS_PROGRESS_BAR = CLASS_PROGRESS + "__bar";
  var CLASS_TOGGLE = CLASS_PREFIX + "toggle";
  var CLASS_TOGGLE_PLAY = CLASS_TOGGLE + "__play";
  var CLASS_TOGGLE_PAUSE = CLASS_TOGGLE + "__pause";
  var CLASS_SPINNER = CLASS_PREFIX + "spinner";
  var CLASS_SR = CLASS_PREFIX + "sr";
  var CLASS_INITIALIZED = STATUS_CLASS_PREFIX + "initialized";
  var CLASS_ACTIVE = STATUS_CLASS_PREFIX + "active";
  var CLASS_PREV = STATUS_CLASS_PREFIX + "prev";
  var CLASS_NEXT = STATUS_CLASS_PREFIX + "next";
  var CLASS_VISIBLE = STATUS_CLASS_PREFIX + "visible";
  var CLASS_LOADING = STATUS_CLASS_PREFIX + "loading";
  var CLASS_FOCUS_IN = STATUS_CLASS_PREFIX + "focus-in";
  var CLASS_OVERFLOW = STATUS_CLASS_PREFIX + "overflow";
  var STATUS_CLASSES = [CLASS_ACTIVE, CLASS_VISIBLE, CLASS_PREV, CLASS_NEXT, CLASS_LOADING, CLASS_FOCUS_IN, CLASS_OVERFLOW];
  var CLASSES = {
    slide: CLASS_SLIDE,
    clone: CLASS_CLONE,
    arrows: CLASS_ARROWS,
    arrow: CLASS_ARROW,
    prev: CLASS_ARROW_PREV,
    next: CLASS_ARROW_NEXT,
    pagination: CLASS_PAGINATION,
    page: CLASS_PAGINATION_PAGE,
    spinner: CLASS_SPINNER
  };
  function closest(from, selector) {
    if (isFunction(from.closest)) {
      return from.closest(selector);
    }
    var elm = from;
    while (elm && elm.nodeType === 1) {
      if (matches(elm, selector)) {
        break;
      }
      elm = elm.parentElement;
    }
    return elm;
  }
  var FRICTION = 5;
  var LOG_INTERVAL = 200;
  var POINTER_DOWN_EVENTS = "touchstart mousedown";
  var POINTER_MOVE_EVENTS = "touchmove mousemove";
  var POINTER_UP_EVENTS = "touchend touchcancel mouseup click";
  function Elements(Splide2, Components2, options) {
    var _EventInterface = EventInterface(Splide2), on = _EventInterface.on, bind = _EventInterface.bind;
    var root = Splide2.root;
    var i18n = options.i18n;
    var elements = {};
    var slides = [];
    var rootClasses = [];
    var trackClasses = [];
    var track;
    var list;
    var isUsingKey;
    function setup() {
      collect();
      init();
      update();
    }
    function mount2() {
      on(EVENT_REFRESH, destroy);
      on(EVENT_REFRESH, setup);
      on(EVENT_UPDATED, update);
      bind(document, POINTER_DOWN_EVENTS + " keydown", function(e) {
        isUsingKey = e.type === "keydown";
      }, {
        capture: true
      });
      bind(root, "focusin", function() {
        toggleClass(root, CLASS_FOCUS_IN, !!isUsingKey);
      });
    }
    function destroy(completely) {
      var attrs = ALL_ATTRIBUTES.concat("style");
      empty(slides);
      removeClass(root, rootClasses);
      removeClass(track, trackClasses);
      removeAttribute([track, list], attrs);
      removeAttribute(root, completely ? attrs : ["style", ARIA_ROLEDESCRIPTION]);
    }
    function update() {
      removeClass(root, rootClasses);
      removeClass(track, trackClasses);
      rootClasses = getClasses(CLASS_ROOT);
      trackClasses = getClasses(CLASS_TRACK);
      addClass(root, rootClasses);
      addClass(track, trackClasses);
      setAttribute(root, ARIA_LABEL, options.label);
      setAttribute(root, ARIA_LABELLEDBY, options.labelledby);
    }
    function collect() {
      track = find("." + CLASS_TRACK);
      list = child(track, "." + CLASS_LIST);
      assert(track && list, "A track/list element is missing.");
      push(slides, children(list, "." + CLASS_SLIDE + ":not(." + CLASS_CLONE + ")"));
      forOwn({
        arrows: CLASS_ARROWS,
        pagination: CLASS_PAGINATION,
        prev: CLASS_ARROW_PREV,
        next: CLASS_ARROW_NEXT,
        bar: CLASS_PROGRESS_BAR,
        toggle: CLASS_TOGGLE
      }, function(className, key) {
        elements[key] = find("." + className);
      });
      assign(elements, {
        root,
        track,
        list,
        slides
      });
    }
    function init() {
      var id = root.id || uniqueId(PROJECT_CODE);
      var role = options.role;
      root.id = id;
      track.id = track.id || id + "-track";
      list.id = list.id || id + "-list";
      if (!getAttribute(root, ROLE) && root.tagName !== "SECTION" && role) {
        setAttribute(root, ROLE, role);
      }
      setAttribute(root, ARIA_ROLEDESCRIPTION, i18n.carousel);
      setAttribute(list, ROLE, "presentation");
    }
    function find(selector) {
      var elm = query(root, selector);
      return elm && closest(elm, "." + CLASS_ROOT) === root ? elm : void 0;
    }
    function getClasses(base) {
      return [base + "--" + options.type, base + "--" + options.direction, options.drag && base + "--draggable", options.isNavigation && base + "--nav", base === CLASS_ROOT && CLASS_ACTIVE];
    }
    return assign(elements, {
      setup,
      mount: mount2,
      destroy
    });
  }
  var SLIDE = "slide";
  var LOOP = "loop";
  var FADE = "fade";
  function Slide$1(Splide2, index, slideIndex, slide) {
    var event = EventInterface(Splide2);
    var on = event.on, emit = event.emit, bind = event.bind;
    var Components = Splide2.Components, root = Splide2.root, options = Splide2.options;
    var isNavigation = options.isNavigation, updateOnMove = options.updateOnMove, i18n = options.i18n, pagination = options.pagination, slideFocus = options.slideFocus;
    var resolve = Components.Direction.resolve;
    var styles = getAttribute(slide, "style");
    var label = getAttribute(slide, ARIA_LABEL);
    var isClone = slideIndex > -1;
    var container = child(slide, "." + CLASS_CONTAINER);
    var destroyed;
    function mount2() {
      if (!isClone) {
        slide.id = root.id + "-slide" + pad(index + 1);
        setAttribute(slide, ROLE, pagination ? "tabpanel" : "group");
        setAttribute(slide, ARIA_ROLEDESCRIPTION, i18n.slide);
        setAttribute(slide, ARIA_LABEL, label || format(i18n.slideLabel, [index + 1, Splide2.length]));
      }
      listen();
    }
    function listen() {
      bind(slide, "click", apply(emit, EVENT_CLICK, self));
      bind(slide, "keydown", apply(emit, EVENT_SLIDE_KEYDOWN, self));
      on([EVENT_MOVED, EVENT_SHIFTED, EVENT_SCROLLED], update);
      on(EVENT_NAVIGATION_MOUNTED, initNavigation);
      if (updateOnMove) {
        on(EVENT_MOVE, onMove);
      }
    }
    function destroy() {
      destroyed = true;
      event.destroy();
      removeClass(slide, STATUS_CLASSES);
      removeAttribute(slide, ALL_ATTRIBUTES);
      setAttribute(slide, "style", styles);
      setAttribute(slide, ARIA_LABEL, label || "");
    }
    function initNavigation() {
      var controls = Splide2.splides.map(function(target) {
        var Slide2 = target.splide.Components.Slides.getAt(index);
        return Slide2 ? Slide2.slide.id : "";
      }).join(" ");
      setAttribute(slide, ARIA_LABEL, format(i18n.slideX, (isClone ? slideIndex : index) + 1));
      setAttribute(slide, ARIA_CONTROLS, controls);
      setAttribute(slide, ROLE, slideFocus ? "button" : "");
      slideFocus && removeAttribute(slide, ARIA_ROLEDESCRIPTION);
    }
    function onMove() {
      if (!destroyed) {
        update();
      }
    }
    function update() {
      if (!destroyed) {
        var curr = Splide2.index;
        updateActivity();
        updateVisibility();
        toggleClass(slide, CLASS_PREV, index === curr - 1);
        toggleClass(slide, CLASS_NEXT, index === curr + 1);
      }
    }
    function updateActivity() {
      var active = isActive();
      if (active !== hasClass(slide, CLASS_ACTIVE)) {
        toggleClass(slide, CLASS_ACTIVE, active);
        setAttribute(slide, ARIA_CURRENT, isNavigation && active || "");
        emit(active ? EVENT_ACTIVE : EVENT_INACTIVE, self);
      }
    }
    function updateVisibility() {
      var visible = isVisible();
      var hidden = !visible && (!isActive() || isClone);
      if (!Splide2.state.is([MOVING, SCROLLING])) {
        setAttribute(slide, ARIA_HIDDEN, hidden || "");
      }
      setAttribute(queryAll(slide, options.focusableNodes || ""), TAB_INDEX, hidden ? -1 : "");
      if (slideFocus) {
        setAttribute(slide, TAB_INDEX, hidden ? -1 : 0);
      }
      if (visible !== hasClass(slide, CLASS_VISIBLE)) {
        toggleClass(slide, CLASS_VISIBLE, visible);
        emit(visible ? EVENT_VISIBLE : EVENT_HIDDEN, self);
      }
      if (!visible && document.activeElement === slide) {
        var Slide2 = Components.Slides.getAt(Splide2.index);
        Slide2 && focus(Slide2.slide);
      }
    }
    function style$1(prop, value, useContainer) {
      style(useContainer && container || slide, prop, value);
    }
    function isActive() {
      var curr = Splide2.index;
      return curr === index || options.cloneStatus && curr === slideIndex;
    }
    function isVisible() {
      if (Splide2.is(FADE)) {
        return isActive();
      }
      var trackRect = rect(Components.Elements.track);
      var slideRect = rect(slide);
      var left = resolve("left", true);
      var right = resolve("right", true);
      return floor(trackRect[left]) <= ceil(slideRect[left]) && floor(slideRect[right]) <= ceil(trackRect[right]);
    }
    function isWithin(from, distance) {
      var diff = abs(from - index);
      if (!isClone && (options.rewind || Splide2.is(LOOP))) {
        diff = min(diff, Splide2.length - diff);
      }
      return diff <= distance;
    }
    var self = {
      index,
      slideIndex,
      slide,
      container,
      isClone,
      mount: mount2,
      destroy,
      update,
      style: style$1,
      isWithin
    };
    return self;
  }
  function Slides(Splide2, Components2, options) {
    var _EventInterface2 = EventInterface(Splide2), on = _EventInterface2.on, emit = _EventInterface2.emit, bind = _EventInterface2.bind;
    var _Components2$Elements = Components2.Elements, slides = _Components2$Elements.slides, list = _Components2$Elements.list;
    var Slides2 = [];
    function mount2() {
      init();
      on(EVENT_REFRESH, destroy);
      on(EVENT_REFRESH, init);
    }
    function init() {
      slides.forEach(function(slide, index) {
        register(slide, index, -1);
      });
    }
    function destroy() {
      forEach$1(function(Slide2) {
        Slide2.destroy();
      });
      empty(Slides2);
    }
    function update() {
      forEach$1(function(Slide2) {
        Slide2.update();
      });
    }
    function register(slide, index, slideIndex) {
      var object = Slide$1(Splide2, index, slideIndex, slide);
      object.mount();
      Slides2.push(object);
      Slides2.sort(function(Slide1, Slide2) {
        return Slide1.index - Slide2.index;
      });
    }
    function get(excludeClones) {
      return excludeClones ? filter(function(Slide2) {
        return !Slide2.isClone;
      }) : Slides2;
    }
    function getIn(page) {
      var Controller2 = Components2.Controller;
      var index = Controller2.toIndex(page);
      var max2 = Controller2.hasFocus() ? 1 : options.perPage;
      return filter(function(Slide2) {
        return between(Slide2.index, index, index + max2 - 1);
      });
    }
    function getAt(index) {
      return filter(index)[0];
    }
    function add(items, index) {
      forEach(items, function(slide) {
        if (isString(slide)) {
          slide = parseHtml(slide);
        }
        if (isHTMLElement(slide)) {
          var ref = slides[index];
          ref ? before(slide, ref) : append(list, slide);
          addClass(slide, options.classes.slide);
          observeImages(slide, apply(emit, EVENT_RESIZE));
        }
      });
      emit(EVENT_REFRESH);
    }
    function remove$1(matcher) {
      remove(filter(matcher).map(function(Slide2) {
        return Slide2.slide;
      }));
      emit(EVENT_REFRESH);
    }
    function forEach$1(iteratee, excludeClones) {
      get(excludeClones).forEach(iteratee);
    }
    function filter(matcher) {
      return Slides2.filter(isFunction(matcher) ? matcher : function(Slide2) {
        return isString(matcher) ? matches(Slide2.slide, matcher) : includes(toArray(matcher), Slide2.index);
      });
    }
    function style2(prop, value, useContainer) {
      forEach$1(function(Slide2) {
        Slide2.style(prop, value, useContainer);
      });
    }
    function observeImages(elm, callback) {
      var images = queryAll(elm, "img");
      var length = images.length;
      if (length) {
        images.forEach(function(img) {
          bind(img, "load error", function() {
            if (!--length) {
              callback();
            }
          });
        });
      } else {
        callback();
      }
    }
    function getLength(excludeClones) {
      return excludeClones ? slides.length : Slides2.length;
    }
    function isEnough() {
      return Slides2.length > options.perPage;
    }
    return {
      mount: mount2,
      destroy,
      update,
      register,
      get,
      getIn,
      getAt,
      add,
      remove: remove$1,
      forEach: forEach$1,
      filter,
      style: style2,
      getLength,
      isEnough
    };
  }
  function Layout(Splide2, Components2, options) {
    var _EventInterface3 = EventInterface(Splide2), on = _EventInterface3.on, bind = _EventInterface3.bind, emit = _EventInterface3.emit;
    var Slides2 = Components2.Slides;
    var resolve = Components2.Direction.resolve;
    var _Components2$Elements2 = Components2.Elements, root = _Components2$Elements2.root, track = _Components2$Elements2.track, list = _Components2$Elements2.list;
    var getAt = Slides2.getAt, styleSlides = Slides2.style;
    var vertical;
    var rootRect;
    var overflow;
    function mount2() {
      init();
      bind(window, "resize load", Throttle(apply(emit, EVENT_RESIZE)));
      on([EVENT_UPDATED, EVENT_REFRESH], init);
      on(EVENT_RESIZE, resize);
    }
    function init() {
      vertical = options.direction === TTB;
      style(root, "maxWidth", unit(options.width));
      style(track, resolve("paddingLeft"), cssPadding(false));
      style(track, resolve("paddingRight"), cssPadding(true));
      resize(true);
    }
    function resize(force) {
      var newRect = rect(root);
      if (force || rootRect.width !== newRect.width || rootRect.height !== newRect.height) {
        style(track, "height", cssTrackHeight());
        styleSlides(resolve("marginRight"), unit(options.gap));
        styleSlides("width", cssSlideWidth());
        styleSlides("height", cssSlideHeight(), true);
        rootRect = newRect;
        emit(EVENT_RESIZED);
        if (overflow !== (overflow = isOverflow())) {
          toggleClass(root, CLASS_OVERFLOW, overflow);
          emit(EVENT_OVERFLOW, overflow);
        }
      }
    }
    function cssPadding(right) {
      var padding = options.padding;
      var prop = resolve(right ? "right" : "left");
      return padding && unit(padding[prop] || (isObject(padding) ? 0 : padding)) || "0px";
    }
    function cssTrackHeight() {
      var height = "";
      if (vertical) {
        height = cssHeight();
        assert(height, "height or heightRatio is missing.");
        height = "calc(" + height + " - " + cssPadding(false) + " - " + cssPadding(true) + ")";
      }
      return height;
    }
    function cssHeight() {
      return unit(options.height || rect(list).width * options.heightRatio);
    }
    function cssSlideWidth() {
      return options.autoWidth ? null : unit(options.fixedWidth) || (vertical ? "" : cssSlideSize());
    }
    function cssSlideHeight() {
      return unit(options.fixedHeight) || (vertical ? options.autoHeight ? null : cssSlideSize() : cssHeight());
    }
    function cssSlideSize() {
      var gap = unit(options.gap);
      return "calc((100%" + (gap && " + " + gap) + ")/" + (options.perPage || 1) + (gap && " - " + gap) + ")";
    }
    function listSize() {
      return rect(list)[resolve("width")];
    }
    function slideSize(index, withoutGap) {
      var Slide2 = getAt(index || 0);
      return Slide2 ? rect(Slide2.slide)[resolve("width")] + (withoutGap ? 0 : getGap()) : 0;
    }
    function totalSize(index, withoutGap) {
      var Slide2 = getAt(index);
      if (Slide2) {
        var right = rect(Slide2.slide)[resolve("right")];
        var left = rect(list)[resolve("left")];
        return abs(right - left) + (withoutGap ? 0 : getGap());
      }
      return 0;
    }
    function sliderSize(withoutGap) {
      return totalSize(Splide2.length - 1) - totalSize(0) + slideSize(0, withoutGap);
    }
    function getGap() {
      var Slide2 = getAt(0);
      return Slide2 && parseFloat(style(Slide2.slide, resolve("marginRight"))) || 0;
    }
    function getPadding(right) {
      return parseFloat(style(track, resolve("padding" + (right ? "Right" : "Left")))) || 0;
    }
    function isOverflow() {
      return Splide2.is(FADE) || sliderSize(true) > listSize();
    }
    return {
      mount: mount2,
      resize,
      listSize,
      slideSize,
      sliderSize,
      totalSize,
      getPadding,
      isOverflow
    };
  }
  var MULTIPLIER = 2;
  function Clones(Splide2, Components2, options) {
    var event = EventInterface(Splide2);
    var on = event.on;
    var Elements2 = Components2.Elements, Slides2 = Components2.Slides;
    var resolve = Components2.Direction.resolve;
    var clones = [];
    var cloneCount;
    function mount2() {
      on(EVENT_REFRESH, remount);
      on([EVENT_UPDATED, EVENT_RESIZE], observe);
      if (cloneCount = computeCloneCount()) {
        generate(cloneCount);
        Components2.Layout.resize(true);
      }
    }
    function remount() {
      destroy();
      mount2();
    }
    function destroy() {
      remove(clones);
      empty(clones);
      event.destroy();
    }
    function observe() {
      var count = computeCloneCount();
      if (cloneCount !== count) {
        if (cloneCount < count || !count) {
          event.emit(EVENT_REFRESH);
        }
      }
    }
    function generate(count) {
      var slides = Slides2.get().slice();
      var length = slides.length;
      if (length) {
        while (slides.length < count) {
          push(slides, slides);
        }
        push(slides.slice(-count), slides.slice(0, count)).forEach(function(Slide2, index) {
          var isHead = index < count;
          var clone = cloneDeep(Slide2.slide, index);
          isHead ? before(clone, slides[0].slide) : append(Elements2.list, clone);
          push(clones, clone);
          Slides2.register(clone, index - count + (isHead ? 0 : length), Slide2.index);
        });
      }
    }
    function cloneDeep(elm, index) {
      var clone = elm.cloneNode(true);
      addClass(clone, options.classes.clone);
      clone.id = Splide2.root.id + "-clone" + pad(index + 1);
      return clone;
    }
    function computeCloneCount() {
      var clones2 = options.clones;
      if (!Splide2.is(LOOP)) {
        clones2 = 0;
      } else if (isUndefined(clones2)) {
        var fixedSize = options[resolve("fixedWidth")] && Components2.Layout.slideSize(0);
        var fixedCount = fixedSize && ceil(rect(Elements2.track)[resolve("width")] / fixedSize);
        clones2 = fixedCount || options[resolve("autoWidth")] && Splide2.length || options.perPage * MULTIPLIER;
      }
      return clones2;
    }
    return {
      mount: mount2,
      destroy
    };
  }
  function Move(Splide2, Components2, options) {
    var _EventInterface4 = EventInterface(Splide2), on = _EventInterface4.on, emit = _EventInterface4.emit;
    var set = Splide2.state.set;
    var _Components2$Layout = Components2.Layout, slideSize = _Components2$Layout.slideSize, getPadding = _Components2$Layout.getPadding, totalSize = _Components2$Layout.totalSize, listSize = _Components2$Layout.listSize, sliderSize = _Components2$Layout.sliderSize;
    var _Components2$Directio = Components2.Direction, resolve = _Components2$Directio.resolve, orient = _Components2$Directio.orient;
    var _Components2$Elements3 = Components2.Elements, list = _Components2$Elements3.list, track = _Components2$Elements3.track;
    var Transition;
    function mount2() {
      Transition = Components2.Transition;
      on([EVENT_MOUNTED, EVENT_RESIZED, EVENT_UPDATED, EVENT_REFRESH], reposition);
    }
    function reposition() {
      if (!Components2.Controller.isBusy()) {
        Components2.Scroll.cancel();
        jump(Splide2.index);
        Components2.Slides.update();
      }
    }
    function move(dest, index, prev, callback) {
      if (dest !== index && canShift(dest > prev)) {
        cancel();
        translate(shift(getPosition(), dest > prev), true);
      }
      set(MOVING);
      emit(EVENT_MOVE, index, prev, dest);
      Transition.start(index, function() {
        set(IDLE);
        emit(EVENT_MOVED, index, prev, dest);
        callback && callback();
      });
    }
    function jump(index) {
      translate(toPosition(index, true));
    }
    function translate(position, preventLoop) {
      if (!Splide2.is(FADE)) {
        var destination = preventLoop ? position : loop(position);
        style(list, "transform", "translate" + resolve("X") + "(" + destination + "px)");
        position !== destination && emit(EVENT_SHIFTED);
      }
    }
    function loop(position) {
      if (Splide2.is(LOOP)) {
        var index = toIndex(position);
        var exceededMax = index > Components2.Controller.getEnd();
        var exceededMin = index < 0;
        if (exceededMin || exceededMax) {
          position = shift(position, exceededMax);
        }
      }
      return position;
    }
    function shift(position, backwards) {
      var excess = position - getLimit(backwards);
      var size = sliderSize();
      position -= orient(size * (ceil(abs(excess) / size) || 1)) * (backwards ? 1 : -1);
      return position;
    }
    function cancel() {
      translate(getPosition(), true);
      Transition.cancel();
    }
    function toIndex(position) {
      var Slides2 = Components2.Slides.get();
      var index = 0;
      var minDistance = Infinity;
      for (var i = 0; i < Slides2.length; i++) {
        var slideIndex = Slides2[i].index;
        var distance = abs(toPosition(slideIndex, true) - position);
        if (distance <= minDistance) {
          minDistance = distance;
          index = slideIndex;
        } else {
          break;
        }
      }
      return index;
    }
    function toPosition(index, trimming) {
      var position = orient(totalSize(index - 1) - offset(index));
      return trimming ? trim(position) : position;
    }
    function getPosition() {
      var left = resolve("left");
      return rect(list)[left] - rect(track)[left] + orient(getPadding(false));
    }
    function trim(position) {
      if (options.trimSpace && Splide2.is(SLIDE)) {
        position = clamp2(position, 0, orient(sliderSize(true) - listSize()));
      }
      return position;
    }
    function offset(index) {
      var focus2 = options.focus;
      return focus2 === "center" ? (listSize() - slideSize(index, true)) / 2 : +focus2 * slideSize(index) || 0;
    }
    function getLimit(max2) {
      return toPosition(max2 ? Components2.Controller.getEnd() : 0, !!options.trimSpace);
    }
    function canShift(backwards) {
      var shifted = orient(shift(getPosition(), backwards));
      return backwards ? shifted >= 0 : shifted <= list[resolve("scrollWidth")] - rect(track)[resolve("width")];
    }
    function exceededLimit(max2, position) {
      position = isUndefined(position) ? getPosition() : position;
      var exceededMin = max2 !== true && orient(position) < orient(getLimit(false));
      var exceededMax = max2 !== false && orient(position) > orient(getLimit(true));
      return exceededMin || exceededMax;
    }
    return {
      mount: mount2,
      move,
      jump,
      translate,
      shift,
      cancel,
      toIndex,
      toPosition,
      getPosition,
      getLimit,
      exceededLimit,
      reposition
    };
  }
  function Controller(Splide2, Components2, options) {
    var _EventInterface5 = EventInterface(Splide2), on = _EventInterface5.on, emit = _EventInterface5.emit;
    var Move2 = Components2.Move;
    var getPosition = Move2.getPosition, getLimit = Move2.getLimit, toPosition = Move2.toPosition;
    var _Components2$Slides = Components2.Slides, isEnough = _Components2$Slides.isEnough, getLength = _Components2$Slides.getLength;
    var omitEnd = options.omitEnd;
    var isLoop = Splide2.is(LOOP);
    var isSlide = Splide2.is(SLIDE);
    var getNext = apply(getAdjacent, false);
    var getPrev = apply(getAdjacent, true);
    var currIndex = options.start || 0;
    var endIndex;
    var prevIndex = currIndex;
    var slideCount;
    var perMove;
    var perPage;
    function mount2() {
      init();
      on([EVENT_UPDATED, EVENT_REFRESH, EVENT_END_INDEX_CHANGED], init);
      on(EVENT_RESIZED, onResized);
    }
    function init() {
      slideCount = getLength(true);
      perMove = options.perMove;
      perPage = options.perPage;
      endIndex = getEnd();
      var index = clamp2(currIndex, 0, omitEnd ? endIndex : slideCount - 1);
      if (index !== currIndex) {
        currIndex = index;
        Move2.reposition();
      }
    }
    function onResized() {
      if (endIndex !== getEnd()) {
        emit(EVENT_END_INDEX_CHANGED);
      }
    }
    function go(control, allowSameIndex, callback) {
      if (!isBusy()) {
        var dest = parse(control);
        var index = loop(dest);
        if (index > -1 && (allowSameIndex || index !== currIndex)) {
          setIndex(index);
          Move2.move(dest, index, prevIndex, callback);
        }
      }
    }
    function scroll(destination, duration, snap, callback) {
      Components2.Scroll.scroll(destination, duration, snap, function() {
        var index = loop(Move2.toIndex(getPosition()));
        setIndex(omitEnd ? min(index, endIndex) : index);
        callback && callback();
      });
    }
    function parse(control) {
      var index = currIndex;
      if (isString(control)) {
        var _ref = control.match(/([+\-<>])(\d+)?/) || [], indicator = _ref[1], number = _ref[2];
        if (indicator === "+" || indicator === "-") {
          index = computeDestIndex(currIndex + +("" + indicator + (+number || 1)), currIndex);
        } else if (indicator === ">") {
          index = number ? toIndex(+number) : getNext(true);
        } else if (indicator === "<") {
          index = getPrev(true);
        }
      } else {
        index = isLoop ? control : clamp2(control, 0, endIndex);
      }
      return index;
    }
    function getAdjacent(prev, destination) {
      var number = perMove || (hasFocus() ? 1 : perPage);
      var dest = computeDestIndex(currIndex + number * (prev ? -1 : 1), currIndex, !(perMove || hasFocus()));
      if (dest === -1 && isSlide) {
        if (!approximatelyEqual(getPosition(), getLimit(!prev), 1)) {
          return prev ? 0 : endIndex;
        }
      }
      return destination ? dest : loop(dest);
    }
    function computeDestIndex(dest, from, snapPage) {
      if (isEnough() || hasFocus()) {
        var index = computeMovableDestIndex(dest);
        if (index !== dest) {
          from = dest;
          dest = index;
          snapPage = false;
        }
        if (dest < 0 || dest > endIndex) {
          if (!perMove && (between(0, dest, from, true) || between(endIndex, from, dest, true))) {
            dest = toIndex(toPage(dest));
          } else {
            if (isLoop) {
              dest = snapPage ? dest < 0 ? -(slideCount % perPage || perPage) : slideCount : dest;
            } else if (options.rewind) {
              dest = dest < 0 ? endIndex : 0;
            } else {
              dest = -1;
            }
          }
        } else {
          if (snapPage && dest !== from) {
            dest = toIndex(toPage(from) + (dest < from ? -1 : 1));
          }
        }
      } else {
        dest = -1;
      }
      return dest;
    }
    function computeMovableDestIndex(dest) {
      if (isSlide && options.trimSpace === "move" && dest !== currIndex) {
        var position = getPosition();
        while (position === toPosition(dest, true) && between(dest, 0, Splide2.length - 1, !options.rewind)) {
          dest < currIndex ? --dest : ++dest;
        }
      }
      return dest;
    }
    function loop(index) {
      return isLoop ? (index + slideCount) % slideCount || 0 : index;
    }
    function getEnd() {
      var end = slideCount - (hasFocus() || isLoop && perMove ? 1 : perPage);
      while (omitEnd && end-- > 0) {
        if (toPosition(slideCount - 1, true) !== toPosition(end, true)) {
          end++;
          break;
        }
      }
      return clamp2(end, 0, slideCount - 1);
    }
    function toIndex(page) {
      return clamp2(hasFocus() ? page : perPage * page, 0, endIndex);
    }
    function toPage(index) {
      return hasFocus() ? min(index, endIndex) : floor((index >= endIndex ? slideCount - 1 : index) / perPage);
    }
    function toDest(destination) {
      var closest2 = Move2.toIndex(destination);
      return isSlide ? clamp2(closest2, 0, endIndex) : closest2;
    }
    function setIndex(index) {
      if (index !== currIndex) {
        prevIndex = currIndex;
        currIndex = index;
      }
    }
    function getIndex(prev) {
      return prev ? prevIndex : currIndex;
    }
    function hasFocus() {
      return !isUndefined(options.focus) || options.isNavigation;
    }
    function isBusy() {
      return Splide2.state.is([MOVING, SCROLLING]) && !!options.waitForTransition;
    }
    return {
      mount: mount2,
      go,
      scroll,
      getNext,
      getPrev,
      getAdjacent,
      getEnd,
      setIndex,
      getIndex,
      toIndex,
      toPage,
      toDest,
      hasFocus,
      isBusy
    };
  }
  var XML_NAME_SPACE = "http://www.w3.org/2000/svg";
  var PATH = "m15.5 0.932-4.3 4.38 14.5 14.6-14.5 14.5 4.3 4.4 14.6-14.6 4.4-4.3-4.4-4.4-14.6-14.6z";
  var SIZE = 40;
  function Arrows(Splide2, Components2, options) {
    var event = EventInterface(Splide2);
    var on = event.on, bind = event.bind, emit = event.emit;
    var classes = options.classes, i18n = options.i18n;
    var Elements2 = Components2.Elements, Controller2 = Components2.Controller;
    var placeholder = Elements2.arrows, track = Elements2.track;
    var wrapper = placeholder;
    var prev = Elements2.prev;
    var next = Elements2.next;
    var created;
    var wrapperClasses;
    var arrows = {};
    function mount2() {
      init();
      on(EVENT_UPDATED, remount);
    }
    function remount() {
      destroy();
      mount2();
    }
    function init() {
      var enabled = options.arrows;
      if (enabled && !(prev && next)) {
        createArrows();
      }
      if (prev && next) {
        assign(arrows, {
          prev,
          next
        });
        display(wrapper, enabled ? "" : "none");
        addClass(wrapper, wrapperClasses = CLASS_ARROWS + "--" + options.direction);
        if (enabled) {
          listen();
          update();
          setAttribute([prev, next], ARIA_CONTROLS, track.id);
          emit(EVENT_ARROWS_MOUNTED, prev, next);
        }
      }
    }
    function destroy() {
      event.destroy();
      removeClass(wrapper, wrapperClasses);
      if (created) {
        remove(placeholder ? [prev, next] : wrapper);
        prev = next = null;
      } else {
        removeAttribute([prev, next], ALL_ATTRIBUTES);
      }
    }
    function listen() {
      on([EVENT_MOUNTED, EVENT_MOVED, EVENT_REFRESH, EVENT_SCROLLED, EVENT_END_INDEX_CHANGED], update);
      bind(next, "click", apply(go, ">"));
      bind(prev, "click", apply(go, "<"));
    }
    function go(control) {
      Controller2.go(control, true);
    }
    function createArrows() {
      wrapper = placeholder || create("div", classes.arrows);
      prev = createArrow(true);
      next = createArrow(false);
      created = true;
      append(wrapper, [prev, next]);
      !placeholder && before(wrapper, track);
    }
    function createArrow(prev2) {
      var arrow = '<button class="' + classes.arrow + " " + (prev2 ? classes.prev : classes.next) + '" type="button"><svg xmlns="' + XML_NAME_SPACE + '" viewBox="0 0 ' + SIZE + " " + SIZE + '" width="' + SIZE + '" height="' + SIZE + '" focusable="false"><path d="' + (options.arrowPath || PATH) + '" />';
      return parseHtml(arrow);
    }
    function update() {
      if (prev && next) {
        var index = Splide2.index;
        var prevIndex = Controller2.getPrev();
        var nextIndex = Controller2.getNext();
        var prevLabel = prevIndex > -1 && index < prevIndex ? i18n.last : i18n.prev;
        var nextLabel = nextIndex > -1 && index > nextIndex ? i18n.first : i18n.next;
        prev.disabled = prevIndex < 0;
        next.disabled = nextIndex < 0;
        setAttribute(prev, ARIA_LABEL, prevLabel);
        setAttribute(next, ARIA_LABEL, nextLabel);
        emit(EVENT_ARROWS_UPDATED, prev, next, prevIndex, nextIndex);
      }
    }
    return {
      arrows,
      mount: mount2,
      destroy,
      update
    };
  }
  var INTERVAL_DATA_ATTRIBUTE = DATA_ATTRIBUTE + "-interval";
  function Autoplay(Splide2, Components2, options) {
    var _EventInterface6 = EventInterface(Splide2), on = _EventInterface6.on, bind = _EventInterface6.bind, emit = _EventInterface6.emit;
    var interval = RequestInterval(options.interval, Splide2.go.bind(Splide2, ">"), onAnimationFrame);
    var isPaused = interval.isPaused;
    var Elements2 = Components2.Elements, _Components2$Elements4 = Components2.Elements, root = _Components2$Elements4.root, toggle = _Components2$Elements4.toggle;
    var autoplay = options.autoplay;
    var hovered;
    var focused;
    var stopped = autoplay === "pause";
    function mount2() {
      if (autoplay) {
        listen();
        toggle && setAttribute(toggle, ARIA_CONTROLS, Elements2.track.id);
        stopped || play();
        update();
      }
    }
    function listen() {
      if (options.pauseOnHover) {
        bind(root, "mouseenter mouseleave", function(e) {
          hovered = e.type === "mouseenter";
          autoToggle();
        });
      }
      if (options.pauseOnFocus) {
        bind(root, "focusin focusout", function(e) {
          focused = e.type === "focusin";
          autoToggle();
        });
      }
      if (toggle) {
        bind(toggle, "click", function() {
          stopped ? play() : pause(true);
        });
      }
      on([EVENT_MOVE, EVENT_SCROLL, EVENT_REFRESH], interval.rewind);
      on(EVENT_MOVE, onMove);
    }
    function play() {
      if (isPaused() && Components2.Slides.isEnough()) {
        interval.start(!options.resetProgress);
        focused = hovered = stopped = false;
        update();
        emit(EVENT_AUTOPLAY_PLAY);
      }
    }
    function pause(stop) {
      if (stop === void 0) {
        stop = true;
      }
      stopped = !!stop;
      update();
      if (!isPaused()) {
        interval.pause();
        emit(EVENT_AUTOPLAY_PAUSE);
      }
    }
    function autoToggle() {
      if (!stopped) {
        hovered || focused ? pause(false) : play();
      }
    }
    function update() {
      if (toggle) {
        toggleClass(toggle, CLASS_ACTIVE, !stopped);
        setAttribute(toggle, ARIA_LABEL, options.i18n[stopped ? "play" : "pause"]);
      }
    }
    function onAnimationFrame(rate) {
      var bar = Elements2.bar;
      bar && style(bar, "width", rate * 100 + "%");
      emit(EVENT_AUTOPLAY_PLAYING, rate);
    }
    function onMove(index) {
      var Slide2 = Components2.Slides.getAt(index);
      interval.set(Slide2 && +getAttribute(Slide2.slide, INTERVAL_DATA_ATTRIBUTE) || options.interval);
    }
    return {
      mount: mount2,
      destroy: interval.cancel,
      play,
      pause,
      isPaused
    };
  }
  function Cover(Splide2, Components2, options) {
    var _EventInterface7 = EventInterface(Splide2), on = _EventInterface7.on;
    function mount2() {
      if (options.cover) {
        on(EVENT_LAZYLOAD_LOADED, apply(toggle, true));
        on([EVENT_MOUNTED, EVENT_UPDATED, EVENT_REFRESH], apply(cover, true));
      }
    }
    function cover(cover2) {
      Components2.Slides.forEach(function(Slide2) {
        var img = child(Slide2.container || Slide2.slide, "img");
        if (img && img.src) {
          toggle(cover2, img, Slide2);
        }
      });
    }
    function toggle(cover2, img, Slide2) {
      Slide2.style("background", cover2 ? 'center/cover no-repeat url("' + img.src + '")' : "", true);
      display(img, cover2 ? "none" : "");
    }
    return {
      mount: mount2,
      destroy: apply(cover, false)
    };
  }
  var BOUNCE_DIFF_THRESHOLD = 10;
  var BOUNCE_DURATION = 600;
  var FRICTION_FACTOR = 0.6;
  var BASE_VELOCITY = 1.5;
  var MIN_DURATION = 800;
  function Scroll(Splide2, Components2, options) {
    var _EventInterface8 = EventInterface(Splide2), on = _EventInterface8.on, emit = _EventInterface8.emit;
    var set = Splide2.state.set;
    var Move2 = Components2.Move;
    var getPosition = Move2.getPosition, getLimit = Move2.getLimit, exceededLimit = Move2.exceededLimit, translate = Move2.translate;
    var isSlide = Splide2.is(SLIDE);
    var interval;
    var callback;
    var friction = 1;
    function mount2() {
      on(EVENT_MOVE, clear);
      on([EVENT_UPDATED, EVENT_REFRESH], cancel);
    }
    function scroll(destination, duration, snap, onScrolled, noConstrain) {
      var from = getPosition();
      clear();
      if (snap && (!isSlide || !exceededLimit())) {
        var size = Components2.Layout.sliderSize();
        var offset = sign(destination) * size * floor(abs(destination) / size) || 0;
        destination = Move2.toPosition(Components2.Controller.toDest(destination % size)) + offset;
      }
      var noDistance = approximatelyEqual(from, destination, 1);
      friction = 1;
      duration = noDistance ? 0 : duration || max(abs(destination - from) / BASE_VELOCITY, MIN_DURATION);
      callback = onScrolled;
      interval = RequestInterval(duration, onEnd, apply(update, from, destination, noConstrain), 1);
      set(SCROLLING);
      emit(EVENT_SCROLL);
      interval.start();
    }
    function onEnd() {
      set(IDLE);
      callback && callback();
      emit(EVENT_SCROLLED);
    }
    function update(from, to, noConstrain, rate) {
      var position = getPosition();
      var target = from + (to - from) * easing(rate);
      var diff = (target - position) * friction;
      translate(position + diff);
      if (isSlide && !noConstrain && exceededLimit()) {
        friction *= FRICTION_FACTOR;
        if (abs(diff) < BOUNCE_DIFF_THRESHOLD) {
          scroll(getLimit(exceededLimit(true)), BOUNCE_DURATION, false, callback, true);
        }
      }
    }
    function clear() {
      if (interval) {
        interval.cancel();
      }
    }
    function cancel() {
      if (interval && !interval.isPaused()) {
        clear();
        onEnd();
      }
    }
    function easing(t) {
      var easingFunc = options.easingFunc;
      return easingFunc ? easingFunc(t) : 1 - Math.pow(1 - t, 4);
    }
    return {
      mount: mount2,
      destroy: clear,
      scroll,
      cancel
    };
  }
  var SCROLL_LISTENER_OPTIONS = {
    passive: false,
    capture: true
  };
  function Drag(Splide2, Components2, options) {
    var _EventInterface9 = EventInterface(Splide2), on = _EventInterface9.on, emit = _EventInterface9.emit, bind = _EventInterface9.bind, unbind = _EventInterface9.unbind;
    var state = Splide2.state;
    var Move2 = Components2.Move, Scroll2 = Components2.Scroll, Controller2 = Components2.Controller, track = Components2.Elements.track, reduce = Components2.Media.reduce;
    var _Components2$Directio2 = Components2.Direction, resolve = _Components2$Directio2.resolve, orient = _Components2$Directio2.orient;
    var getPosition = Move2.getPosition, exceededLimit = Move2.exceededLimit;
    var basePosition;
    var baseEvent;
    var prevBaseEvent;
    var isFree;
    var dragging;
    var exceeded = false;
    var clickPrevented;
    var disabled;
    var target;
    function mount2() {
      bind(track, POINTER_MOVE_EVENTS, noop, SCROLL_LISTENER_OPTIONS);
      bind(track, POINTER_UP_EVENTS, noop, SCROLL_LISTENER_OPTIONS);
      bind(track, POINTER_DOWN_EVENTS, onPointerDown, SCROLL_LISTENER_OPTIONS);
      bind(track, "click", onClick, {
        capture: true
      });
      bind(track, "dragstart", prevent);
      on([EVENT_MOUNTED, EVENT_UPDATED], init);
    }
    function init() {
      var drag = options.drag;
      disable(!drag);
      isFree = drag === "free";
    }
    function onPointerDown(e) {
      clickPrevented = false;
      if (!disabled) {
        var isTouch = isTouchEvent(e);
        if (isDraggable(e.target) && (isTouch || !e.button)) {
          if (!Controller2.isBusy()) {
            target = isTouch ? track : window;
            dragging = state.is([MOVING, SCROLLING]);
            prevBaseEvent = null;
            bind(target, POINTER_MOVE_EVENTS, onPointerMove, SCROLL_LISTENER_OPTIONS);
            bind(target, POINTER_UP_EVENTS, onPointerUp, SCROLL_LISTENER_OPTIONS);
            Move2.cancel();
            Scroll2.cancel();
            save(e);
          } else {
            prevent(e, true);
          }
        }
      }
    }
    function onPointerMove(e) {
      if (!state.is(DRAGGING)) {
        state.set(DRAGGING);
        emit(EVENT_DRAG);
      }
      if (e.cancelable) {
        if (dragging) {
          Move2.translate(basePosition + constrain(diffCoord(e)));
          var expired = diffTime(e) > LOG_INTERVAL;
          var hasExceeded = exceeded !== (exceeded = exceededLimit());
          if (expired || hasExceeded) {
            save(e);
          }
          clickPrevented = true;
          emit(EVENT_DRAGGING);
          prevent(e);
        } else if (isSliderDirection(e)) {
          dragging = shouldStart(e);
          prevent(e);
        }
      }
    }
    function onPointerUp(e) {
      if (state.is(DRAGGING)) {
        state.set(IDLE);
        emit(EVENT_DRAGGED);
      }
      if (dragging) {
        move(e);
        prevent(e);
      }
      unbind(target, POINTER_MOVE_EVENTS, onPointerMove);
      unbind(target, POINTER_UP_EVENTS, onPointerUp);
      dragging = false;
    }
    function onClick(e) {
      if (!disabled && clickPrevented) {
        prevent(e, true);
      }
    }
    function save(e) {
      prevBaseEvent = baseEvent;
      baseEvent = e;
      basePosition = getPosition();
    }
    function move(e) {
      var velocity = computeVelocity(e);
      var destination = computeDestination(velocity);
      var rewind = options.rewind && options.rewindByDrag;
      reduce(false);
      if (isFree) {
        Controller2.scroll(destination, 0, options.snap);
      } else if (Splide2.is(FADE)) {
        Controller2.go(orient(sign(velocity)) < 0 ? rewind ? "<" : "-" : rewind ? ">" : "+");
      } else if (Splide2.is(SLIDE) && exceeded && rewind) {
        Controller2.go(exceededLimit(true) ? ">" : "<");
      } else {
        Controller2.go(Controller2.toDest(destination), true);
      }
      reduce(true);
    }
    function shouldStart(e) {
      var thresholds = options.dragMinThreshold;
      var isObj = isObject(thresholds);
      var mouse = isObj && thresholds.mouse || 0;
      var touch = (isObj ? thresholds.touch : +thresholds) || 10;
      return abs(diffCoord(e)) > (isTouchEvent(e) ? touch : mouse);
    }
    function isSliderDirection(e) {
      return abs(diffCoord(e)) > abs(diffCoord(e, true));
    }
    function computeVelocity(e) {
      if (Splide2.is(LOOP) || !exceeded) {
        var time = diffTime(e);
        if (time && time < LOG_INTERVAL) {
          return diffCoord(e) / time;
        }
      }
      return 0;
    }
    function computeDestination(velocity) {
      return getPosition() + sign(velocity) * min(abs(velocity) * (options.flickPower || 600), isFree ? Infinity : Components2.Layout.listSize() * (options.flickMaxPages || 1));
    }
    function diffCoord(e, orthogonal) {
      return coordOf(e, orthogonal) - coordOf(getBaseEvent(e), orthogonal);
    }
    function diffTime(e) {
      return timeOf(e) - timeOf(getBaseEvent(e));
    }
    function getBaseEvent(e) {
      return baseEvent === e && prevBaseEvent || baseEvent;
    }
    function coordOf(e, orthogonal) {
      return (isTouchEvent(e) ? e.changedTouches[0] : e)["page" + resolve(orthogonal ? "Y" : "X")];
    }
    function constrain(diff) {
      return diff / (exceeded && Splide2.is(SLIDE) ? FRICTION : 1);
    }
    function isDraggable(target2) {
      var noDrag = options.noDrag;
      return !matches(target2, "." + CLASS_PAGINATION_PAGE + ", ." + CLASS_ARROW) && (!noDrag || !matches(target2, noDrag));
    }
    function isTouchEvent(e) {
      return typeof TouchEvent !== "undefined" && e instanceof TouchEvent;
    }
    function isDragging() {
      return dragging;
    }
    function disable(value) {
      disabled = value;
    }
    return {
      mount: mount2,
      disable,
      isDragging
    };
  }
  var NORMALIZATION_MAP = {
    Spacebar: " ",
    Right: ARROW_RIGHT,
    Left: ARROW_LEFT,
    Up: ARROW_UP,
    Down: ARROW_DOWN
  };
  function normalizeKey(key) {
    key = isString(key) ? key : key.key;
    return NORMALIZATION_MAP[key] || key;
  }
  var KEYBOARD_EVENT = "keydown";
  function Keyboard(Splide2, Components2, options) {
    var _EventInterface10 = EventInterface(Splide2), on = _EventInterface10.on, bind = _EventInterface10.bind, unbind = _EventInterface10.unbind;
    var root = Splide2.root;
    var resolve = Components2.Direction.resolve;
    var target;
    var disabled;
    function mount2() {
      init();
      on(EVENT_UPDATED, destroy);
      on(EVENT_UPDATED, init);
      on(EVENT_MOVE, onMove);
    }
    function init() {
      var keyboard = options.keyboard;
      if (keyboard) {
        target = keyboard === "global" ? window : root;
        bind(target, KEYBOARD_EVENT, onKeydown);
      }
    }
    function destroy() {
      unbind(target, KEYBOARD_EVENT);
    }
    function disable(value) {
      disabled = value;
    }
    function onMove() {
      var _disabled = disabled;
      disabled = true;
      nextTick(function() {
        disabled = _disabled;
      });
    }
    function onKeydown(e) {
      if (!disabled) {
        var key = normalizeKey(e);
        if (key === resolve(ARROW_LEFT)) {
          Splide2.go("<");
        } else if (key === resolve(ARROW_RIGHT)) {
          Splide2.go(">");
        }
      }
    }
    return {
      mount: mount2,
      destroy,
      disable
    };
  }
  var SRC_DATA_ATTRIBUTE = DATA_ATTRIBUTE + "-lazy";
  var SRCSET_DATA_ATTRIBUTE = SRC_DATA_ATTRIBUTE + "-srcset";
  var IMAGE_SELECTOR = "[" + SRC_DATA_ATTRIBUTE + "], [" + SRCSET_DATA_ATTRIBUTE + "]";
  function LazyLoad(Splide2, Components2, options) {
    var _EventInterface11 = EventInterface(Splide2), on = _EventInterface11.on, off = _EventInterface11.off, bind = _EventInterface11.bind, emit = _EventInterface11.emit;
    var isSequential = options.lazyLoad === "sequential";
    var events = [EVENT_MOVED, EVENT_SCROLLED];
    var entries = [];
    function mount2() {
      if (options.lazyLoad) {
        init();
        on(EVENT_REFRESH, init);
      }
    }
    function init() {
      empty(entries);
      register();
      if (isSequential) {
        loadNext();
      } else {
        off(events);
        on(events, check);
        check();
      }
    }
    function register() {
      Components2.Slides.forEach(function(Slide2) {
        queryAll(Slide2.slide, IMAGE_SELECTOR).forEach(function(img) {
          var src = getAttribute(img, SRC_DATA_ATTRIBUTE);
          var srcset = getAttribute(img, SRCSET_DATA_ATTRIBUTE);
          if (src !== img.src || srcset !== img.srcset) {
            var className = options.classes.spinner;
            var parent = img.parentElement;
            var spinner = child(parent, "." + className) || create("span", className, parent);
            entries.push([img, Slide2, spinner]);
            img.src || display(img, "none");
          }
        });
      });
    }
    function check() {
      entries = entries.filter(function(data) {
        var distance = options.perPage * ((options.preloadPages || 1) + 1) - 1;
        return data[1].isWithin(Splide2.index, distance) ? load(data) : true;
      });
      entries.length || off(events);
    }
    function load(data) {
      var img = data[0];
      addClass(data[1].slide, CLASS_LOADING);
      bind(img, "load error", apply(onLoad, data));
      setAttribute(img, "src", getAttribute(img, SRC_DATA_ATTRIBUTE));
      setAttribute(img, "srcset", getAttribute(img, SRCSET_DATA_ATTRIBUTE));
      removeAttribute(img, SRC_DATA_ATTRIBUTE);
      removeAttribute(img, SRCSET_DATA_ATTRIBUTE);
    }
    function onLoad(data, e) {
      var img = data[0], Slide2 = data[1];
      removeClass(Slide2.slide, CLASS_LOADING);
      if (e.type !== "error") {
        remove(data[2]);
        display(img, "");
        emit(EVENT_LAZYLOAD_LOADED, img, Slide2);
        emit(EVENT_RESIZE);
      }
      isSequential && loadNext();
    }
    function loadNext() {
      entries.length && load(entries.shift());
    }
    return {
      mount: mount2,
      destroy: apply(empty, entries),
      check
    };
  }
  function Pagination(Splide2, Components2, options) {
    var event = EventInterface(Splide2);
    var on = event.on, emit = event.emit, bind = event.bind;
    var Slides2 = Components2.Slides, Elements2 = Components2.Elements, Controller2 = Components2.Controller;
    var hasFocus = Controller2.hasFocus, getIndex = Controller2.getIndex, go = Controller2.go;
    var resolve = Components2.Direction.resolve;
    var placeholder = Elements2.pagination;
    var items = [];
    var list;
    var paginationClasses;
    function mount2() {
      destroy();
      on([EVENT_UPDATED, EVENT_REFRESH, EVENT_END_INDEX_CHANGED], mount2);
      var enabled = options.pagination;
      placeholder && display(placeholder, enabled ? "" : "none");
      if (enabled) {
        on([EVENT_MOVE, EVENT_SCROLL, EVENT_SCROLLED], update);
        createPagination();
        update();
        emit(EVENT_PAGINATION_MOUNTED, {
          list,
          items
        }, getAt(Splide2.index));
      }
    }
    function destroy() {
      if (list) {
        remove(placeholder ? slice(list.children) : list);
        removeClass(list, paginationClasses);
        empty(items);
        list = null;
      }
      event.destroy();
    }
    function createPagination() {
      var length = Splide2.length;
      var classes = options.classes, i18n = options.i18n, perPage = options.perPage;
      var max2 = hasFocus() ? Controller2.getEnd() + 1 : ceil(length / perPage);
      list = placeholder || create("ul", classes.pagination, Elements2.track.parentElement);
      addClass(list, paginationClasses = CLASS_PAGINATION + "--" + getDirection());
      setAttribute(list, ROLE, "tablist");
      setAttribute(list, ARIA_LABEL, i18n.select);
      setAttribute(list, ARIA_ORIENTATION, getDirection() === TTB ? "vertical" : "");
      for (var i = 0; i < max2; i++) {
        var li = create("li", null, list);
        var button = create("button", {
          class: classes.page,
          type: "button"
        }, li);
        var controls = Slides2.getIn(i).map(function(Slide2) {
          return Slide2.slide.id;
        });
        var text2 = !hasFocus() && perPage > 1 ? i18n.pageX : i18n.slideX;
        bind(button, "click", apply(onClick, i));
        if (options.paginationKeyboard) {
          bind(button, "keydown", apply(onKeydown, i));
        }
        setAttribute(li, ROLE, "presentation");
        setAttribute(button, ROLE, "tab");
        setAttribute(button, ARIA_CONTROLS, controls.join(" "));
        setAttribute(button, ARIA_LABEL, format(text2, i + 1));
        setAttribute(button, TAB_INDEX, -1);
        items.push({
          li,
          button,
          page: i
        });
      }
    }
    function onClick(page) {
      go(">" + page, true);
    }
    function onKeydown(page, e) {
      var length = items.length;
      var key = normalizeKey(e);
      var dir = getDirection();
      var nextPage = -1;
      if (key === resolve(ARROW_RIGHT, false, dir)) {
        nextPage = ++page % length;
      } else if (key === resolve(ARROW_LEFT, false, dir)) {
        nextPage = (--page + length) % length;
      } else if (key === "Home") {
        nextPage = 0;
      } else if (key === "End") {
        nextPage = length - 1;
      }
      var item = items[nextPage];
      if (item) {
        focus(item.button);
        go(">" + nextPage);
        prevent(e, true);
      }
    }
    function getDirection() {
      return options.paginationDirection || options.direction;
    }
    function getAt(index) {
      return items[Controller2.toPage(index)];
    }
    function update() {
      var prev = getAt(getIndex(true));
      var curr = getAt(getIndex());
      if (prev) {
        var button = prev.button;
        removeClass(button, CLASS_ACTIVE);
        removeAttribute(button, ARIA_SELECTED);
        setAttribute(button, TAB_INDEX, -1);
      }
      if (curr) {
        var _button = curr.button;
        addClass(_button, CLASS_ACTIVE);
        setAttribute(_button, ARIA_SELECTED, true);
        setAttribute(_button, TAB_INDEX, "");
      }
      emit(EVENT_PAGINATION_UPDATED, {
        list,
        items
      }, prev, curr);
    }
    return {
      items,
      mount: mount2,
      destroy,
      getAt,
      update
    };
  }
  var TRIGGER_KEYS = [" ", "Enter"];
  function Sync(Splide2, Components2, options) {
    var isNavigation = options.isNavigation, slideFocus = options.slideFocus;
    var events = [];
    function mount2() {
      Splide2.splides.forEach(function(target) {
        if (!target.isParent) {
          sync(Splide2, target.splide);
          sync(target.splide, Splide2);
        }
      });
      if (isNavigation) {
        navigate();
      }
    }
    function destroy() {
      events.forEach(function(event) {
        event.destroy();
      });
      empty(events);
    }
    function remount() {
      destroy();
      mount2();
    }
    function sync(splide, target) {
      var event = EventInterface(splide);
      event.on(EVENT_MOVE, function(index, prev, dest) {
        target.go(target.is(LOOP) ? dest : index);
      });
      events.push(event);
    }
    function navigate() {
      var event = EventInterface(Splide2);
      var on = event.on;
      on(EVENT_CLICK, onClick);
      on(EVENT_SLIDE_KEYDOWN, onKeydown);
      on([EVENT_MOUNTED, EVENT_UPDATED], update);
      events.push(event);
      event.emit(EVENT_NAVIGATION_MOUNTED, Splide2.splides);
    }
    function update() {
      setAttribute(Components2.Elements.list, ARIA_ORIENTATION, options.direction === TTB ? "vertical" : "");
    }
    function onClick(Slide2) {
      Splide2.go(Slide2.index);
    }
    function onKeydown(Slide2, e) {
      if (includes(TRIGGER_KEYS, normalizeKey(e))) {
        onClick(Slide2);
        prevent(e);
      }
    }
    return {
      setup: apply(Components2.Media.set, {
        slideFocus: isUndefined(slideFocus) ? isNavigation : slideFocus
      }, true),
      mount: mount2,
      destroy,
      remount
    };
  }
  function Wheel(Splide2, Components2, options) {
    var _EventInterface12 = EventInterface(Splide2), bind = _EventInterface12.bind;
    var lastTime = 0;
    function mount2() {
      if (options.wheel) {
        bind(Components2.Elements.track, "wheel", onWheel, SCROLL_LISTENER_OPTIONS);
      }
    }
    function onWheel(e) {
      if (e.cancelable) {
        var deltaY = e.deltaY;
        var backwards = deltaY < 0;
        var timeStamp = timeOf(e);
        var _min = options.wheelMinThreshold || 0;
        var sleep = options.wheelSleep || 0;
        if (abs(deltaY) > _min && timeStamp - lastTime > sleep) {
          Splide2.go(backwards ? "<" : ">");
          lastTime = timeStamp;
        }
        shouldPrevent(backwards) && prevent(e);
      }
    }
    function shouldPrevent(backwards) {
      return !options.releaseWheel || Splide2.state.is(MOVING) || Components2.Controller.getAdjacent(backwards) !== -1;
    }
    return {
      mount: mount2
    };
  }
  var SR_REMOVAL_DELAY = 90;
  function Live(Splide2, Components2, options) {
    var _EventInterface13 = EventInterface(Splide2), on = _EventInterface13.on;
    var track = Components2.Elements.track;
    var enabled = options.live && !options.isNavigation;
    var sr = create("span", CLASS_SR);
    var interval = RequestInterval(SR_REMOVAL_DELAY, apply(toggle, false));
    function mount2() {
      if (enabled) {
        disable(!Components2.Autoplay.isPaused());
        setAttribute(track, ARIA_ATOMIC, true);
        sr.textContent = "\u2026";
        on(EVENT_AUTOPLAY_PLAY, apply(disable, true));
        on(EVENT_AUTOPLAY_PAUSE, apply(disable, false));
        on([EVENT_MOVED, EVENT_SCROLLED], apply(toggle, true));
      }
    }
    function toggle(active) {
      setAttribute(track, ARIA_BUSY, active);
      if (active) {
        append(track, sr);
        interval.start();
      } else {
        remove(sr);
        interval.cancel();
      }
    }
    function destroy() {
      removeAttribute(track, [ARIA_LIVE, ARIA_ATOMIC, ARIA_BUSY]);
      remove(sr);
    }
    function disable(disabled) {
      if (enabled) {
        setAttribute(track, ARIA_LIVE, disabled ? "off" : "polite");
      }
    }
    return {
      mount: mount2,
      disable,
      destroy
    };
  }
  var ComponentConstructors = /* @__PURE__ */ Object.freeze({
    __proto__: null,
    Media,
    Direction,
    Elements,
    Slides,
    Layout,
    Clones,
    Move,
    Controller,
    Arrows,
    Autoplay,
    Cover,
    Scroll,
    Drag,
    Keyboard,
    LazyLoad,
    Pagination,
    Sync,
    Wheel,
    Live
  });
  var I18N = {
    prev: "Previous slide",
    next: "Next slide",
    first: "Go to first slide",
    last: "Go to last slide",
    slideX: "Go to slide %s",
    pageX: "Go to page %s",
    play: "Start autoplay",
    pause: "Pause autoplay",
    carousel: "carousel",
    slide: "slide",
    select: "Select a slide to show",
    slideLabel: "%s of %s"
  };
  var DEFAULTS = {
    type: "slide",
    role: "region",
    speed: 400,
    perPage: 1,
    cloneStatus: true,
    arrows: true,
    pagination: true,
    paginationKeyboard: true,
    interval: 5e3,
    pauseOnHover: true,
    pauseOnFocus: true,
    resetProgress: true,
    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    drag: true,
    direction: "ltr",
    trimSpace: true,
    focusableNodes: "a, button, textarea, input, select, iframe",
    live: true,
    classes: CLASSES,
    i18n: I18N,
    reducedMotion: {
      speed: 0,
      rewindSpeed: 0,
      autoplay: "pause"
    }
  };
  function Fade(Splide2, Components2, options) {
    var Slides2 = Components2.Slides;
    function mount2() {
      EventInterface(Splide2).on([EVENT_MOUNTED, EVENT_REFRESH], init);
    }
    function init() {
      Slides2.forEach(function(Slide2) {
        Slide2.style("transform", "translateX(-" + 100 * Slide2.index + "%)");
      });
    }
    function start(index, done) {
      Slides2.style("transition", "opacity " + options.speed + "ms " + options.easing);
      nextTick(done);
    }
    return {
      mount: mount2,
      start,
      cancel: noop
    };
  }
  function Slide(Splide2, Components2, options) {
    var Move2 = Components2.Move, Controller2 = Components2.Controller, Scroll2 = Components2.Scroll;
    var list = Components2.Elements.list;
    var transition = apply(style, list, "transition");
    var endCallback;
    function mount2() {
      EventInterface(Splide2).bind(list, "transitionend", function(e) {
        if (e.target === list && endCallback) {
          cancel();
          endCallback();
        }
      });
    }
    function start(index, done) {
      var destination = Move2.toPosition(index, true);
      var position = Move2.getPosition();
      var speed = getSpeed(index);
      if (abs(destination - position) >= 1 && speed >= 1) {
        if (options.useScroll) {
          Scroll2.scroll(destination, speed, false, done);
        } else {
          transition("transform " + speed + "ms " + options.easing);
          Move2.translate(destination, true);
          endCallback = done;
        }
      } else {
        Move2.jump(index);
        done();
      }
    }
    function cancel() {
      transition("");
      Scroll2.cancel();
    }
    function getSpeed(index) {
      var rewindSpeed = options.rewindSpeed;
      if (Splide2.is(SLIDE) && rewindSpeed) {
        var prev = Controller2.getIndex(true);
        var end = Controller2.getEnd();
        if (prev === 0 && index >= end || prev >= end && index === 0) {
          return rewindSpeed;
        }
      }
      return options.speed;
    }
    return {
      mount: mount2,
      start,
      cancel
    };
  }
  var _Splide = /* @__PURE__ */ function() {
    function _Splide2(target, options) {
      this.event = EventInterface();
      this.Components = {};
      this.state = State(CREATED);
      this.splides = [];
      this._o = {};
      this._E = {};
      var root = isString(target) ? query(document, target) : target;
      assert(root, root + " is invalid.");
      this.root = root;
      options = merge({
        label: getAttribute(root, ARIA_LABEL) || "",
        labelledby: getAttribute(root, ARIA_LABELLEDBY) || ""
      }, DEFAULTS, _Splide2.defaults, options || {});
      try {
        merge(options, JSON.parse(getAttribute(root, DATA_ATTRIBUTE)));
      } catch (e) {
        assert(false, "Invalid JSON");
      }
      this._o = Object.create(merge({}, options));
    }
    var _proto = _Splide2.prototype;
    _proto.mount = function mount2(Extensions, Transition) {
      var _this = this;
      var state = this.state, Components2 = this.Components;
      assert(state.is([CREATED, DESTROYED]), "Already mounted!");
      state.set(CREATED);
      this._C = Components2;
      this._T = Transition || this._T || (this.is(FADE) ? Fade : Slide);
      this._E = Extensions || this._E;
      var Constructors = assign({}, ComponentConstructors, this._E, {
        Transition: this._T
      });
      forOwn(Constructors, function(Component, key) {
        var component = Component(_this, Components2, _this._o);
        Components2[key] = component;
        component.setup && component.setup();
      });
      forOwn(Components2, function(component) {
        component.mount && component.mount();
      });
      this.emit(EVENT_MOUNTED);
      addClass(this.root, CLASS_INITIALIZED);
      state.set(IDLE);
      this.emit(EVENT_READY);
      return this;
    };
    _proto.sync = function sync(splide) {
      this.splides.push({
        splide
      });
      splide.splides.push({
        splide: this,
        isParent: true
      });
      if (this.state.is(IDLE)) {
        this._C.Sync.remount();
        splide.Components.Sync.remount();
      }
      return this;
    };
    _proto.go = function go(control) {
      this._C.Controller.go(control);
      return this;
    };
    _proto.on = function on(events, callback) {
      this.event.on(events, callback);
      return this;
    };
    _proto.off = function off(events) {
      this.event.off(events);
      return this;
    };
    _proto.emit = function emit(event) {
      var _this$event;
      (_this$event = this.event).emit.apply(_this$event, [event].concat(slice(arguments, 1)));
      return this;
    };
    _proto.add = function add(slides, index) {
      this._C.Slides.add(slides, index);
      return this;
    };
    _proto.remove = function remove2(matcher) {
      this._C.Slides.remove(matcher);
      return this;
    };
    _proto.is = function is(type) {
      return this._o.type === type;
    };
    _proto.refresh = function refresh() {
      this.emit(EVENT_REFRESH);
      return this;
    };
    _proto.destroy = function destroy(completely) {
      if (completely === void 0) {
        completely = true;
      }
      var event = this.event, state = this.state;
      if (state.is(CREATED)) {
        EventInterface(this).on(EVENT_READY, this.destroy.bind(this, completely));
      } else {
        forOwn(this._C, function(component) {
          component.destroy && component.destroy(completely);
        }, true);
        event.emit(EVENT_DESTROY);
        event.destroy();
        completely && empty(this.splides);
        state.set(DESTROYED);
      }
      return this;
    };
    _createClass(_Splide2, [{
      key: "options",
      get: function get() {
        return this._o;
      },
      set: function set(options) {
        this._C.Media.set(options, true, true);
      }
    }, {
      key: "length",
      get: function get() {
        return this._C.Slides.getLength(true);
      }
    }, {
      key: "index",
      get: function get() {
        return this._C.Controller.getIndex();
      }
    }]);
    return _Splide2;
  }();
  var Splide = _Splide;
  Splide.defaults = {};
  Splide.STATES = STATES;

  // src/components/splide/dynamicArrows.ts
  var CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  var CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  function addDynamicArrows(element, splide) {
    const mobileArrowsQuery = window.matchMedia("(max-width: 479px)");
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "sc-arrow sc-arrow--prev";
    prevBtn.setAttribute("aria-label", "Previous slide");
    prevBtn.innerHTML = CHEVRON_LEFT;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "sc-arrow sc-arrow--next";
    nextBtn.setAttribute("aria-label", "Next slide");
    nextBtn.innerHTML = CHEVRON_RIGHT;
    prevBtn.style.opacity = "0";
    prevBtn.style.pointerEvents = "none";
    prevBtn.style.transition = "opacity 0.2s ease";
    nextBtn.style.opacity = "0";
    nextBtn.style.pointerEvents = "none";
    nextBtn.style.transition = "opacity 0.2s ease";
    element.appendChild(prevBtn);
    element.appendChild(nextBtn);
    prevBtn.addEventListener("click", () => splide.go("<"));
    nextBtn.addEventListener("click", () => splide.go(">"));
    const show = (btn) => {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "";
    };
    const hide = (btn) => {
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
    };
    const update = () => {
      if (mobileArrowsQuery.matches) {
        hide(prevBtn);
        hide(nextBtn);
        return;
      }
      const list = element.querySelector(".splide__list");
      const track = element.querySelector(".splide__track");
      if (!list || !track) return;
      const hasOverflow = list.scrollWidth > track.clientWidth + 1;
      if (!hasOverflow) {
        hide(prevBtn);
        hide(nextBtn);
        return;
      }
      if (!splide.Components?.Controller) return;
      const end = splide.Components.Controller.getEnd();
      if (splide.index <= 0) {
        hide(prevBtn);
      } else {
        show(prevBtn);
      }
      if (splide.index >= end) {
        hide(nextBtn);
      } else {
        show(nextBtn);
      }
    };
    update();
    requestAnimationFrame(update);
    splide.on("moved", update);
    splide.on("resize", update);
    const watchArrowMedia = () => {
      if (typeof mobileArrowsQuery.addEventListener === "function") {
        mobileArrowsQuery.addEventListener("change", update);
        return () => mobileArrowsQuery.removeEventListener("change", update);
      }
      mobileArrowsQuery.addListener(update);
      return () => mobileArrowsQuery.removeListener(update);
    };
    const unwatchArrowMedia = watchArrowMedia();
    splide.on("destroy", () => {
      unwatchArrowMedia();
      prevBtn.remove();
      nextBtn.remove();
    });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(element);
      splide.on("destroy", () => ro.disconnect());
    }
  }

  // src/utils/easing.ts
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // src/utils/transforms.ts
  function getTranslateX(el) {
    const m = getComputedStyle(el).transform;
    if (!m || m === "none") return 0;
    const m2d = m.match(/matrix\(([-0-9.,\s]+)\)/);
    if (m2d && m2d[1]) {
      const nums = m2d[1].split(",").map(Number);
      return nums[4] || 0;
    }
    const m3d = m.match(/matrix3d\(([-0-9.,\s]+)\)/);
    if (m3d && m3d[1]) {
      const nums = m3d[1].split(",").map(Number);
      return nums[12] || 0;
    }
    return 0;
  }

  // src/components/splide/autoScroll.ts
  function createCustomAutoScroll(splide, element, opts) {
    const {
      Components: {
        Elements: { list }
      }
    } = splide;
    let running = false;
    let rafId = 0;
    let last = 0;
    let baseX = 0;
    let drift = 0;
    let speed = opts.baseSpeedPxPerSec ?? 40;
    const slowFactor = opts.slowFactor ?? 0.25;
    let targetSpeed = speed;
    const tweenMs = opts.tweenMs ?? 250;
    function setTargetSpeed(newSpeed, duration) {
      const from = targetSpeed;
      const to = newSpeed;
      const start2 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start2) / duration);
        targetSpeed = from + (to - from) * easeInOutQuad(t);
        if (t < 1) requestAnimationFrame(step);
      }
      if (duration > 0) requestAnimationFrame(step);
      else targetSpeed = newSpeed;
    }
    function tick(ts) {
      if (!running) return;
      if (!last) last = ts;
      const dt = (ts - last) / 1e3;
      last = ts;
      const v = targetSpeed;
      drift += v * dt;
      const x = baseX - drift;
      list.style.transform = `translate3d(${x}px,0,0)`;
      if (Math.abs(drift) > 2e4) {
        baseX = getTranslateX(list);
        drift = 0;
      }
      rafId = requestAnimationFrame(tick);
    }
    function start() {
      if (running) return;
      running = true;
      last = 0;
      baseX = getTranslateX(list);
      list.style.willChange = "transform";
      list.style.transform = `translate3d(${baseX - 0.01}px,0,0)`;
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }
    element.addEventListener("mouseenter", () => setTargetSpeed(speed * slowFactor, tweenMs));
    element.addEventListener("mouseleave", () => setTargetSpeed(speed, tweenMs));
    element.addEventListener("focusin", () => setTargetSpeed(speed * slowFactor, tweenMs));
    element.addEventListener("focusout", () => setTargetSpeed(speed, tweenMs));
    splide.on("drag", stop);
    splide.on("move", stop);
    splide.on("moved", () => {
      baseX = getTranslateX(list);
      drift = 0;
      ensureStart();
    });
    splide.on("resized", () => {
      baseX = getTranslateX(list);
      drift = 0;
    });
    function ensureStart() {
      if (document.visibilityState === "visible" && !running) start();
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") ensureStart();
      else stop();
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) ensureStart();
          else stop();
        });
      },
      { root: null, threshold: 0.1 }
    );
    io.observe(element);
    return {
      start,
      stop,
      setTargetSpeed,
      setBaseSpeedPxPerSec: (px) => {
        speed = px;
        setTargetSpeed(px, 0);
      }
    };
  }

  // src/components/splide/hoverSlowdown.ts
  function addHoverSlowdown(element, splide, opts) {
    const factor = opts.factor ?? 0.33;
    const rampMs = opts.rampMs ?? 250;
    const controller = createCustomAutoScroll(splide, element, {
      baseSpeedPxPerSec: opts.baseSpeedPxPerSec ?? 70,
      slowFactor: factor,
      tweenMs: rampMs
    });
    const kick = () => {
      requestAnimationFrame(() => requestAnimationFrame(controller.start));
    };
    splide.on("ready", kick);
    splide.on("mounted", kick);
    splide.on("resized", () => {
      requestAnimationFrame(() => requestAnimationFrame(controller.start));
    });
    if (document.visibilityState === "visible") {
      requestAnimationFrame(() => requestAnimationFrame(controller.start));
    }
    const id = element.getAttribute("id") || "";
    const customWindow = window;
    customWindow.splideAuto = customWindow.splideAuto || {};
    customWindow.splideAuto[id] = controller;
    return { mode: "custom", controller };
  }

  // src/components/splide/keyboardControl.ts
  var registeredSliders = /* @__PURE__ */ new Map();
  var isListening = false;
  function registerKeyboardSlider(element, splide) {
    registeredSliders.set(element, splide);
    ensureKeyboardListener();
  }
  function ensureKeyboardListener() {
    if (isListening) return;
    document.addEventListener("keydown", handleKeydown);
    isListening = true;
  }
  function handleKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    const activeSlider = getBestVisibleSlider();
    if (!activeSlider) return;
    event.preventDefault();
    activeSlider.splide.go(event.key === "ArrowLeft" ? ">" : "<");
  }
  function getBestVisibleSlider() {
    let bestElement;
    let bestSplide;
    let bestScore = 0;
    registeredSliders.forEach((splide, element) => {
      if (!isControllable(element)) return;
      const score = getVisibilityScore(element);
      if (score > bestScore) {
        bestElement = element;
        bestSplide = splide;
        bestScore = score;
      }
    });
    return bestElement && bestSplide ? { element: bestElement, splide: bestSplide } : void 0;
  }
  function isControllable(element) {
    return element.classList.contains("is-active") && !element.hidden && element.isConnected;
  }
  function getVisibilityScore(element) {
    const rect2 = element.getBoundingClientRect();
    if (rect2.width <= 0 || rect2.height <= 0) return 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const visibleWidth = Math.max(0, Math.min(rect2.right, viewportWidth) - Math.max(rect2.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect2.bottom, viewportHeight) - Math.max(rect2.top, 0));
    if (visibleWidth <= 0 || visibleHeight <= 0) return 0;
    const visibleArea = visibleWidth * visibleHeight;
    const visibleRatio = visibleArea / (rect2.width * rect2.height);
    const verticalRatio = visibleHeight / rect2.height;
    const horizontalRatio = visibleWidth / rect2.width;
    if (verticalRatio < 0.15 || horizontalRatio < 0.3) return 0;
    const centerY = rect2.top + rect2.height / 2;
    const centerDistance = Math.abs(centerY - viewportHeight / 2);
    const centerScore = Math.max(0, 1 - centerDistance / (viewportHeight / 2));
    return visibleRatio * 100 + verticalRatio * 10 + centerScore * 20;
  }
  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    const editableElement = target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"]'
    );
    return Boolean(editableElement);
  }

  // src/components/splide/selectionStyles.ts
  var STYLE_ID3 = "dd-splide-selection-styles";
  function addReviewSelectionStyles() {
    if (document.getElementById(STYLE_ID3)) return;
    const style2 = document.createElement("style");
    style2.id = STYLE_ID3;
    style2.textContent = `
.review-slider,
.review-slider .review-card,
.review-slider .review-card * {
  -webkit-user-select: none;
  user-select: none;
}

.review-slider .review-card {
  -webkit-user-drag: none;
}
`;
    document.head.appendChild(style2);
  }

  // src/components/splide/initSplide.ts
  function initSplide(selector, options, useAutoScroll, useDynamicArrows = false) {
    const splideElements = document.querySelectorAll(selector);
    if (!splideElements.length) return;
    splideElements.forEach((element, index) => {
      const uniqueId2 = `${selector.replace(".", "")}-${index}`;
      element.setAttribute("id", uniqueId2);
      const resolvedOptions = typeof options === "function" ? options(element, index) : options;
      const splide = new Splide(element, { ...resolvedOptions });
      registerKeyboardSlider(element, splide);
      if (selector === ".review-slider") {
        addReviewSelectionStyles();
      }
      splide.on("mounted", () => {
        if (useDynamicArrows) {
          addDynamicArrows(element, splide);
        }
        if (useAutoScroll) {
          const attr = element.getAttribute("data-auto-speed");
          const baseSpeed = attr ? parseFloat(attr) : void 0;
          addHoverSlowdown(element, splide, {
            factor: 0.33,
            rampMs: 250,
            baseSpeedPxPerSec: baseSpeed
          });
        }
      });
      const progressBar = document.querySelector(".review-progress-bar");
      if (progressBar && selector === ".review-slider") {
        const updateProgress = () => {
          const end = splide.Components.Controller.getEnd() + 1;
          const rate = Math.min((splide.index + 1) / end, 1);
          progressBar.style.width = String(100 * rate) + "%";
        };
        splide.on("move", updateProgress);
        splide.on("mounted", updateProgress);
        splide.on("ready", updateProgress);
      }
      const ext = window.splide && window.splide.Extensions ? window.splide.Extensions : void 0;
      if (useAutoScroll && ext) {
        splide.mount(ext);
      } else {
        splide.mount();
      }
    });
  }

  // src/components/syncFlexWrap.ts
  function initSyncFlexWrap() {
    const component = document.querySelector(".service-cards-component");
    const bullets = document.querySelector(".services-bullets-wrapper");
    if (!component || !bullets) return;
    const check = () => {
      const children2 = Array.from(component.children);
      if (children2.length < 2) return;
      const firstTop = children2[0].getBoundingClientRect().top;
      const wrapped = children2.slice(1).some((el) => el.getBoundingClientRect().top > firstTop + 1);
      bullets.style.flexDirection = wrapped ? "row" : "";
      bullets.style.flexWrap = wrapped ? "wrap" : "";
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(component);
  }

  // src/index.ts
  function boot() {
    const serviceCardsV2Options = {
      type: "slide",
      autoWidth: true,
      perMove: 1,
      gap: "0",
      arrows: false,
      pagination: false,
      drag: true,
      focus: "left",
      snap: true
    };
    const splideConfigs = [
      {
        selector: ".review-slider",
        options: {
          type: "loop",
          autoWidth: true,
          perMove: 1,
          gap: "0",
          arrows: false,
          pagination: false,
          drag: true,
          focus: "left",
          snap: true
        },
        useAutoScroll: false
      },
      {
        selector: ".article-slider",
        options: {
          type: "slide",
          autoWidth: true,
          perMove: 1,
          gap: "0",
          arrows: false,
          pagination: false,
          drag: true,
          focus: "left",
          snap: true
        },
        useAutoScroll: false
      },
      {
        selector: ".about-cards",
        options: {
          type: "slide",
          autoWidth: true,
          perMove: 1,
          gap: "0",
          arrows: false,
          pagination: false,
          drag: true,
          focus: "left",
          snap: true
        },
        useAutoScroll: false
      },
      {
        selector: ".service-cards",
        options: {
          type: "slide",
          autoWidth: true,
          perMove: 1,
          gap: "0",
          arrows: false,
          pagination: false,
          drag: true,
          focus: "left",
          snap: true
        },
        useAutoScroll: false,
        useDynamicArrows: false
      },
      {
        selector: ".splide.service-cards-v2",
        options: (element) => ({
          ...serviceCardsV2Options,
          ...element.querySelector(".splide__list.mobile-stack") ? { breakpoints: { 479: { destroy: true } } } : {}
        }),
        useAutoScroll: false,
        useDynamicArrows: true
      }
    ];
    splideConfigs.forEach(
      (cfg) => initSplide(cfg.selector, cfg.options, cfg.useAutoScroll, cfg.useDynamicArrows)
    );
    initSyncFlexWrap();
    initSavingsCalculator();
    initHowItWorksVideo();
    initRepairCostExplorer();
  }
  function whenWebflowReady(cb) {
    const tryPush = (attempt = 0) => {
      const wf = window.Webflow;
      if (wf && typeof wf.push === "function") {
        wf.push(cb);
        return;
      }
      if (document.readyState === "complete") {
        cb();
        return;
      }
      if (attempt < 20) {
        window.setTimeout(() => tryPush(attempt + 1), 50);
      } else {
        window.addEventListener("load", cb, { once: true });
      }
    };
    tryPush();
  }
  whenWebflowReady(() => {
    setTimeout(() => {
      boot();
    }, 100);
  });
  Object.assign(window, { boot });
})();
/*! Bundled license information:

@splidejs/splide/dist/js/splide.esm.js:
  (*!
   * Splide.js
   * Version  : 4.1.4
   * License  : MIT
   * Copyright: 2022 Naotoshi Fujita
   *)
*/
//# sourceMappingURL=index.js.map
