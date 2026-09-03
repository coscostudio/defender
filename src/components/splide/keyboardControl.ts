import type Splide from '@splidejs/splide';

const registeredSliders = new Map<HTMLElement, Splide>();
let isListening = false;

export function registerKeyboardSlider(element: HTMLElement, splide: Splide) {
  registeredSliders.set(element, splide);
  ensureKeyboardListener();
}

function ensureKeyboardListener() {
  if (isListening) return;

  document.addEventListener('keydown', handleKeydown);
  isListening = true;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  const activeSlider = getBestVisibleSlider();
  if (!activeSlider) return;

  event.preventDefault();
  activeSlider.splide.go(event.key === 'ArrowLeft' ? '>' : '<');
}

function getBestVisibleSlider() {
  let bestElement: HTMLElement | undefined;
  let bestSplide: Splide | undefined;
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

  return bestElement && bestSplide ? { element: bestElement, splide: bestSplide } : undefined;
}

function isControllable(element: HTMLElement) {
  return element.classList.contains('is-active') && !element.hidden && element.isConnected;
}

function getVisibilityScore(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  if (visibleWidth <= 0 || visibleHeight <= 0) return 0;

  const visibleArea = visibleWidth * visibleHeight;
  const visibleRatio = visibleArea / (rect.width * rect.height);
  const verticalRatio = visibleHeight / rect.height;
  const horizontalRatio = visibleWidth / rect.width;

  if (verticalRatio < 0.15 || horizontalRatio < 0.3) return 0;

  const centerY = rect.top + rect.height / 2;
  const centerDistance = Math.abs(centerY - viewportHeight / 2);
  const centerScore = Math.max(0, 1 - centerDistance / (viewportHeight / 2));

  return visibleRatio * 100 + verticalRatio * 10 + centerScore * 20;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  const editableElement = target.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"]'
  );

  return Boolean(editableElement);
}
