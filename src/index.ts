import { initHowItWorksVideo } from './components/howItWorksVideo';
import { initSavingsCalculator } from './components/savingsCalculator';
import {
  initSplide,
  type SplideOptions,
  type SplideOptionsInput,
} from './components/splide/initSplide';
import { initSyncFlexWrap } from './components/syncFlexWrap';

type WebflowGlobal = {
  push?: (callback: () => void) => void;
};

type CustomWindow = Window & {
  Webflow?: WebflowGlobal;
  boot?: typeof boot;
};

type SplideConfig = {
  selector: string;
  options: SplideOptionsInput;
  useAutoScroll: boolean;
  useDynamicArrows?: boolean;
};

function boot() {
  // Splide configs copied from Webflow inline script
  const serviceCardsV2Options = {
    type: 'slide',
    autoWidth: true,
    perMove: 1,
    gap: '0',
    arrows: false,
    pagination: false,
    drag: true,
    focus: 'left',
    snap: true,
  } satisfies SplideOptions;

  const splideConfigs: SplideConfig[] = [
    {
      selector: '.review-slider',
      options: {
        type: 'loop',
        autoWidth: true,
        perMove: 1,
        gap: '0',
        arrows: false,
        pagination: false,
        drag: true,
        focus: 'left',
        snap: true,
      },
      useAutoScroll: false,
    },
    {
      selector: '.article-slider',
      options: {
        type: 'slide',
        autoWidth: true,
        perMove: 1,
        gap: '0',
        arrows: false,
        pagination: false,
        drag: true,
        focus: 'left',
        snap: true,
      },
      useAutoScroll: false,
    },
    {
      selector: '.about-cards',
      options: {
        type: 'slide',
        autoWidth: true,
        perMove: 1,
        gap: '0',
        arrows: false,
        pagination: false,
        drag: true,
        focus: 'left',
        snap: true,
      },
      useAutoScroll: false,
    },
    {
      selector: '.service-cards',
      options: {
        type: 'slide',
        autoWidth: true,
        perMove: 1,
        gap: '0',
        arrows: false,
        pagination: false,
        drag: true,
        focus: 'left',
        snap: true,
      },
      useAutoScroll: false,
      useDynamicArrows: false,
    },
    {
      selector: '.splide.service-cards-v2',
      options: (element: HTMLElement) => ({
        ...serviceCardsV2Options,
        ...(element.querySelector('.splide__list.mobile-stack')
          ? { breakpoints: { 479: { destroy: true } } }
          : {}),
      }),
      useAutoScroll: false,
      useDynamicArrows: true,
    },
  ];

  splideConfigs.forEach((cfg) =>
    initSplide(cfg.selector, cfg.options, cfg.useAutoScroll, cfg.useDynamicArrows)
  );

  initSyncFlexWrap();
  initSavingsCalculator();
  initHowItWorksVideo();
}

function whenWebflowReady(cb: () => void) {
  const tryPush = (attempt = 0) => {
    const wf = (window as CustomWindow).Webflow;
    if (wf && typeof wf.push === 'function') {
      wf.push(cb);
      return;
    }

    if (document.readyState === 'complete') {
      cb();
      return;
    }

    if (attempt < 20) {
      window.setTimeout(() => tryPush(attempt + 1), 50);
    } else {
      window.addEventListener('load', cb, { once: true });
    }
  };

  tryPush();
}

whenWebflowReady(() => {
  // Small delay to let Webflow finish layout/interactions
  setTimeout(() => {
    boot();
  }, 100);
});

// Expose helper if you want to call it from the Webflow console
Object.assign(window as CustomWindow, { boot });
