import type Splide from '@splidejs/splide';

import { easeInOutQuad } from '../../utils/easing';
import { getTranslateX } from '../../utils/transforms';

export type CustomAutoScrollOptions = {
  baseSpeedPxPerSec?: number;
  slowFactor?: number;
  tweenMs?: number;
};

export function createCustomAutoScroll(
  splide: Splide,
  element: HTMLElement,
  opts: CustomAutoScrollOptions
) {
  const list = (splide as any).Components.Elements.list as HTMLElement;
  let running = false;
  let rafId = 0;
  let last = 0;
  let baseX = 0;
  let drift = 0;
  let speed = opts.baseSpeedPxPerSec ?? 40;
  const slowFactor = opts.slowFactor ?? 0.25;
  let targetSpeed = speed;
  const tweenMs = opts.tweenMs ?? 250;

  function setTargetSpeed(newSpeed: number, duration: number) {
    const from = targetSpeed;
    const to = newSpeed;
    const start = performance.now();

    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      targetSpeed = from + (to - from) * easeInOutQuad(t);
      if (t < 1) requestAnimationFrame(step);
    }

    if (duration > 0) requestAnimationFrame(step);
    else targetSpeed = newSpeed;
  }

  function tick(ts: number) {
    if (!running) return;
    if (!last) last = ts;

    const dt = (ts - last) / 1000;
    last = ts;

    const v = targetSpeed;
    drift += v * dt;

    const x = baseX - drift;
    list.style.transform = `translate3d(${x}px,0,0)`;

    if (Math.abs(drift) > 20000) {
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
    list.style.willChange = 'transform';
    list.style.transform = `translate3d(${baseX - 0.01}px,0,0)`;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  element.addEventListener('mouseenter', () => setTargetSpeed(speed * slowFactor, tweenMs));
  element.addEventListener('mouseleave', () => setTargetSpeed(speed, tweenMs));
  element.addEventListener('focusin', () => setTargetSpeed(speed * slowFactor, tweenMs));
  element.addEventListener('focusout', () => setTargetSpeed(speed, tweenMs));

  splide.on('drag', stop);
  splide.on('move', stop);
  splide.on('moved', () => {
    baseX = getTranslateX(list);
    drift = 0;
    ensureStart();
  });
  splide.on('resized', () => {
    baseX = getTranslateX(list);
    drift = 0;
  });

  function ensureStart() {
    if (document.visibilityState === 'visible' && !running) start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureStart();
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
    setBaseSpeedPxPerSec: (px: number) => {
      speed = px;
      setTargetSpeed(px, 0);
    },
  };
}

export function tweenAutoScrollSpeedExt(splide: Splide, toSpeed: number, durationMs: number) {
  const getSpeed = () =>
    ((splide.options as any).autoScroll && (splide.options as any).autoScroll.speed) || 0;
  const from = getSpeed();
  if (from === toSpeed || durationMs <= 0) {
    (splide.options as any).autoScroll = { ...(splide.options as any).autoScroll, speed: toSpeed };
    return;
  }
  const start = performance.now();
  function step(now: number) {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeInOutQuad(t);
    const current = from + (toSpeed - from) * eased;
    (splide.options as any).autoScroll = { ...(splide.options as any).autoScroll, speed: current };
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
