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
  const tryPush = (attempt = 0) => {
    const wf: any = (window as any).Webflow;
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
      if (document.readyState === 'complete') {
        cb();
      } else {
        window.addEventListener('load', cb, { once: true });
      }
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
Object.assign(window as any, { boot });
