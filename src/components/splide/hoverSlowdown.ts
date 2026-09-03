import type Splide from '@splidejs/splide';

import { createCustomAutoScroll, type CustomAutoScrollController } from './autoScroll';

type CustomAutoWindow = Window & {
  splideAuto?: Record<string, CustomAutoScrollController>;
};

export function addHoverSlowdown(
  element: HTMLElement,
  splide: Splide,
  opts: { factor?: number; rampMs?: number; baseSpeedPxPerSec?: number }
) {
  const factor = opts.factor ?? 0.33;
  const rampMs = opts.rampMs ?? 250;

  // Always use custom continuous autoscroll; ignore official extension if present.
  const controller = createCustomAutoScroll(splide, element, {
    baseSpeedPxPerSec: opts.baseSpeedPxPerSec ?? 70,
    slowFactor: factor,
    tweenMs: rampMs,
  });

  const kick = () => {
    requestAnimationFrame(() => requestAnimationFrame(controller.start));
  };

  splide.on('ready', kick);
  splide.on('mounted', kick);
  splide.on('resized', () => {
    requestAnimationFrame(() => requestAnimationFrame(controller.start));
  });

  if (document.visibilityState === 'visible') {
    requestAnimationFrame(() => requestAnimationFrame(controller.start));
  }

  // Expose controller per slider for runtime tweaks
  const id = element.getAttribute('id') || '';
  const customWindow = window as CustomAutoWindow;
  customWindow.splideAuto = customWindow.splideAuto || {};
  customWindow.splideAuto[id] = controller;

  return { mode: 'custom' as const, controller };
}
