const DURATION = 260;
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function initModalTriggers() {
  // Open
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element).closest<HTMLElement>('[button-trigger]');
    if (!trigger) return;
    const modal = document.getElementById(trigger.getAttribute('button-trigger') ?? '');
    if (!modal) return;
    e.preventDefault();
    openModal(modal);
  });

  // Close via close button or background trigger
  document.addEventListener('click', (e) => {
    const closeBtn = (e.target as Element).closest<HTMLElement>('.popup-close-trigger, .trigger_close');
    if (!closeBtn) return;
    e.preventDefault();
    const modal = closeBtn.closest<HTMLElement>('[id$="-popup"]');
    if (modal) closeModal(modal);
  });
}

function openModal(modal: HTMLElement) {
  modal.style.transition = 'none';
  modal.style.opacity = '0';
  modal.style.display = 'flex';
  modal.offsetHeight; // force reflow before transition
  modal.style.transition = `opacity ${DURATION}ms ${EASE}`;
  modal.style.opacity = '1';
}

function closeModal(modal: HTMLElement) {
  modal.style.transition = `opacity ${DURATION}ms ${EASE}`;
  modal.style.opacity = '0';
  setTimeout(() => {
    modal.style.display = 'none';
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('transition');
  }, DURATION);
}
