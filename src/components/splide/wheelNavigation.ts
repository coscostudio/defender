import type Splide from '@splidejs/splide';

export function addWheelNavigation(element: HTMLElement, splide: Splide) {
  const debounceDelay = 150;
  let lastScrollTime = Date.now();

  element.addEventListener(
    'wheel',
    function (event: WheelEvent) {
      if ((event as any).ctrlKey) return;

      const { deltaX } = event;
      const { deltaY } = event;

      if (event.shiftKey && Math.abs(deltaX) === 0) {
        event.preventDefault();
        if (deltaY > 0) splide.go('+1');
        else if (deltaY < 0) splide.go('-1');
        return;
      }

      if (!event.shiftKey && Math.abs(deltaX) !== 0) {
        if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

        const scrollLeftMax = element.scrollWidth - element.offsetWidth;
        if (element.scrollLeft + deltaX < 0 || element.scrollLeft + deltaX > scrollLeftMax) {
          event.preventDefault();
        }

        const now = Date.now();
        const elapsed = now - lastScrollTime;

        if (elapsed > 1000) {
          if (deltaX > 0) splide.go('+1');
          else if (deltaX < 0) splide.go('-1');
          lastScrollTime = now;
        } else if (elapsed >= debounceDelay) {
          if (Math.abs(deltaX) > 5) {
            if (deltaX > 0) splide.go('+1');
            else if (deltaX < 0) splide.go('-1');
            lastScrollTime = now;
          }
        }
      }
    },
    false
  );
}
