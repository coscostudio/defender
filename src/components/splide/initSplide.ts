import Splide from '@splidejs/splide';

import { addHoverSlowdown } from './hoverSlowdown';
import { addWheelNavigation } from './wheelNavigation';

export type SplideInit = {
  selector: string;
  options: Record<string, any>;
  useAutoScroll: boolean;
};

export function initSplide(selector: string, options: Record<string, any>, useAutoScroll: boolean) {
  const splideElements = document.querySelectorAll<HTMLElement>(selector);
  if (!splideElements.length) return;

  splideElements.forEach((element, index) => {
    const uniqueId = `${selector.replace('.', '')}-${index}`;
    element.setAttribute('id', uniqueId);

    const splide = new Splide(element, { ...options });

    splide.on('mounted', () => {
      (splide as any).Components.Elements.slides.forEach((slide: HTMLElement, i: number) => {
        slide.addEventListener('click', () => {
          splide.go(i);
        });
      });

      addWheelNavigation(element, splide);

      if (useAutoScroll) {
        const attr = element.getAttribute('data-auto-speed');
        const baseSpeed = attr ? parseFloat(attr) : undefined;
        addHoverSlowdown(element, splide, { factor: 0.33, rampMs: 250, baseSpeedPxPerSec: baseSpeed });
      }
    });

    const progressBar = document.querySelector<HTMLElement>('.review-progress-bar');
    if (progressBar && selector === '.review-slider') {
      const updateProgress = () => {
        const end = (splide as any).Components.Controller.getEnd() + 1;
        const rate = Math.min(((splide as any).index + 1) / end, 1);
        progressBar.style.width = String(100 * rate) + '%';
      };
      splide.on('move', updateProgress);
      splide.on('mounted', updateProgress);
      splide.on('ready', updateProgress);
    }

    const ext = window.splide && window.splide.Extensions ? window.splide.Extensions : undefined;
    if (useAutoScroll && ext) {
      splide.mount(ext);
    } else {
      splide.mount();
    }
  });
}
