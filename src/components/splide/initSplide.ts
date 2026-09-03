import Splide, { type Options } from '@splidejs/splide';

import { addDynamicArrows } from './dynamicArrows';
import { addHoverSlowdown } from './hoverSlowdown';
import { registerKeyboardSlider } from './keyboardControl';
import { addReviewSelectionStyles } from './selectionStyles';

export type SplideInit = {
  selector: string;
  options: SplideOptionsInput;
  useAutoScroll: boolean;
};

export type SplideOptions = Omit<Options, 'focus'> & {
  focus?: Options['focus'] | 'left';
} & Record<string, unknown>;
export type SplideOptionsInput =
  | SplideOptions
  | ((element: HTMLElement, index: number) => SplideOptions);

export function initSplide(
  selector: string,
  options: SplideOptionsInput,
  useAutoScroll: boolean,
  useDynamicArrows = false
) {
  const splideElements = document.querySelectorAll<HTMLElement>(selector);
  if (!splideElements.length) return;

  splideElements.forEach((element, index) => {
    const uniqueId = `${selector.replace('.', '')}-${index}`;
    element.setAttribute('id', uniqueId);

    const resolvedOptions = typeof options === 'function' ? options(element, index) : options;
    const splide = new Splide(element, { ...resolvedOptions } as unknown as Options);
    registerKeyboardSlider(element, splide);

    if (selector === '.review-slider') {
      addReviewSelectionStyles();
    }

    splide.on('mounted', () => {
      if (useDynamicArrows) {
        addDynamicArrows(element, splide);
      }

      if (useAutoScroll) {
        const attr = element.getAttribute('data-auto-speed');
        const baseSpeed = attr ? parseFloat(attr) : undefined;
        addHoverSlowdown(element, splide, {
          factor: 0.33,
          rampMs: 250,
          baseSpeedPxPerSec: baseSpeed,
        });
      }
    });

    const progressBar = document.querySelector<HTMLElement>('.review-progress-bar');
    if (progressBar && selector === '.review-slider') {
      const updateProgress = () => {
        const end = splide.Components.Controller.getEnd() + 1;
        const rate = Math.min((splide.index + 1) / end, 1);
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
