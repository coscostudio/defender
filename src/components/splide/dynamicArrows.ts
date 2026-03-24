import type Splide from '@splidejs/splide';

const CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

export function addDynamicArrows(element: HTMLElement, splide: Splide) {
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'sc-arrow sc-arrow--prev';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.innerHTML = CHEVRON_LEFT;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'sc-arrow sc-arrow--next';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.innerHTML = CHEVRON_RIGHT;

  prevBtn.style.opacity = '0';
  prevBtn.style.pointerEvents = 'none';
  prevBtn.style.transition = 'opacity 0.2s ease';
  nextBtn.style.opacity = '0';
  nextBtn.style.pointerEvents = 'none';
  nextBtn.style.transition = 'opacity 0.2s ease';

  element.appendChild(prevBtn);
  element.appendChild(nextBtn);

  prevBtn.addEventListener('click', () => splide.go('<'));
  nextBtn.addEventListener('click', () => splide.go('>'));

  const show = (btn: HTMLButtonElement) => {
    btn.style.opacity = '1';
    btn.style.pointerEvents = '';
  };
  const hide = (btn: HTMLButtonElement) => {
    btn.style.opacity = '0';
    btn.style.pointerEvents = 'none';
  };

  const update = () => {
    const list = element.querySelector<HTMLElement>('.splide__list');
    const track = element.querySelector<HTMLElement>('.splide__track');
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

  // Run immediately, then again after layout paint (handles re-mount timing)
  update();
  requestAnimationFrame(update);

  splide.on('moved', update);
  splide.on('resize', update);

  // Always clean up buttons on destroy, regardless of ResizeObserver support
  splide.on('destroy', () => {
    prevBtn.remove();
    nextBtn.remove();
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(element);
    splide.on('destroy', () => ro.disconnect());
  }
}
