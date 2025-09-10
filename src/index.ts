import { initFAQ } from './components/faq';
import { initMobileNav } from './components/nav/mobileNav';
import { initSplide } from './components/splide/initSplide';

function boot() {
  // Splide configs copied from Webflow inline script
  const splideConfigs = [
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
        autoScroll: { speed: 0.5, pauseOnHover: false, pauseOnFocus: false },
      },
      useAutoScroll: true,
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
    },
  ];

  splideConfigs.forEach((cfg) => initSplide(cfg.selector, cfg.options, cfg.useAutoScroll));
}

function whenWebflowReady(cb: () => void) {
  const wf: any = (window as any).Webflow;
  if (wf && typeof wf.push === 'function') {
    wf.push(cb);
  } else {
    window.addEventListener('load', () => setTimeout(cb, 100));
  }
}

whenWebflowReady(() => {
  // Small delay to let Webflow finish layout/interactions
  setTimeout(() => {
    boot();
    initFAQ();
    initMobileNav();
  }, 100);
});

// Expose helper if you want to call it from the Webflow console
Object.assign(window as any, { boot });
