type FAQConfig = {
  animationDuration: number;
  easing: string;
  stagger: number;
  allowMultipleOpen: boolean;
};

const config: FAQConfig = {
  animationDuration: 300,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  stagger: 50,
  allowMultipleOpen: true,
};

function setupInitialStyles(list: HTMLElement, icon: HTMLElement) {
  list.style.overflow = 'hidden';
  list.style.transition = `max-height ${config.animationDuration}ms ${config.easing}, opacity ${config.animationDuration}ms ${config.easing}, padding ${config.animationDuration}ms ${config.easing}`;
  list.style.maxHeight = '0';
  list.style.opacity = '0';
  list.style.paddingTop = '0';
  list.style.paddingBottom = '0';

  icon.style.transition = `transform ${config.animationDuration}ms ${config.easing}`;
  icon.style.transform = 'rotate(0deg)';
  icon.style.transformOrigin = 'center';
}

function overrideWebflowBehavior(dropdown: HTMLElement, list: HTMLElement) {
  dropdown.removeAttribute('data-delay');
  dropdown.removeAttribute('data-hover');
  list.style.display = 'block';
  dropdown.classList.remove('w--open');
}

function openDropdown(
  dropdown: HTMLElement,
  list: HTMLElement,
  icon: HTMLElement,
  callback?: () => void
) {
  dropdown.classList.add('w--open');

  list.style.maxHeight = 'none';
  list.style.opacity = '1';
  const naturalHeight = list.scrollHeight;

  list.style.maxHeight = '0';
  list.style.opacity = '0';

  // force reflow
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  list.offsetHeight;

  requestAnimationFrame(() => {
    list.style.maxHeight = naturalHeight + 'px';
    list.style.opacity = '1';
    list.style.paddingTop = '';
    list.style.paddingBottom = '';
    icon.style.transform = 'rotate(180deg)';
  });

  window.setTimeout(() => {
    list.style.maxHeight = 'none';
    if (callback) callback();
  }, config.animationDuration);
}

function closeDropdown(
  dropdown: HTMLElement,
  list: HTMLElement,
  icon: HTMLElement,
  callback?: () => void
) {
  const currentHeight = list.scrollHeight;
  list.style.maxHeight = currentHeight + 'px';

  // force reflow
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  list.offsetHeight;

  requestAnimationFrame(() => {
    list.style.maxHeight = '0';
    list.style.opacity = '0';
    list.style.paddingTop = '0';
    list.style.paddingBottom = '0';
    icon.style.transform = 'rotate(0deg)';
  });

  window.setTimeout(() => {
    dropdown.classList.remove('w--open');
    if (callback) callback();
  }, config.animationDuration);
}

function closeAllDropdowns(callback?: () => void) {
  const allDropdowns = document.querySelectorAll<HTMLElement>('.faq-dropdown.w--open');
  if (allDropdowns.length === 0) {
    if (callback) callback();
    return;
  }

  let closedCount = 0;
  const totalToClose = allDropdowns.length;

  allDropdowns.forEach((dropdown) => {
    const list = dropdown.querySelector<HTMLElement>('.faq-dropdown-list');
    const icon = dropdown.querySelector<HTMLElement>('.faq-dropdown-toggle-icon');
    if (!list || !icon) return;
    closeDropdown(dropdown, list, icon, () => {
      closedCount++;
      if (closedCount === totalToClose && callback) {
        window.setTimeout(callback, config.stagger);
      }
    });
  });
}

function handleInitialState() {
  const openDropdowns = document.querySelectorAll<HTMLElement>('.faq-dropdown.w--open');
  openDropdowns.forEach((dropdown) => {
    const list = dropdown.querySelector<HTMLElement>('.faq-dropdown-list');
    const icon = dropdown.querySelector<HTMLElement>('.faq-dropdown-toggle-icon');
    if (list && icon) {
      list.style.maxHeight = 'none';
      list.style.opacity = '1';
      list.style.paddingTop = '';
      list.style.paddingBottom = '';
      icon.style.transform = 'rotate(180deg)';
    }
  });
}

function addEnhancedStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .faq-dropdown-list { transform-origin: top; }
    .faq-dropdown-toggle { cursor: pointer; user-select: none; }
    .faq-dropdown-toggle:hover .faq-dropdown-toggle-icon {
      color: var(--background-color--background-light-green, #9ce069);
      transition: color 200ms ease;
    }
    .faq-dropdown-list * {
      transition: opacity ${config.animationDuration * 0.8}ms ${config.easing} ${config.animationDuration * 0.2}ms;
    }
    .faq-dropdown { contain: layout style; }
  `;
  document.head.appendChild(style);
}

function setupDropdown(dropdown: HTMLElement) {
  const toggle = dropdown.querySelector<HTMLElement>('.faq-dropdown-toggle');
  const list = dropdown.querySelector<HTMLElement>('.faq-dropdown-list');
  const icon = dropdown.querySelector<HTMLElement>('.faq-dropdown-toggle-icon');
  if (!toggle || !list || !icon) {
    console.warn('Missing required elements in dropdown:', dropdown);
    return;
  }

  setupInitialStyles(list, icon);
  overrideWebflowBehavior(dropdown, list);

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = dropdown.classList.contains('w--open');
    if (isOpen) {
      closeDropdown(dropdown, list, icon);
      return;
    }

    if (config.allowMultipleOpen) {
      openDropdown(dropdown, list, icon);
    } else {
      closeAllDropdowns(() => openDropdown(dropdown, list, icon));
    }
  });
}

function initializeFAQAnimations() {
  const faqDropdowns = document.querySelectorAll<HTMLElement>('.faq-dropdown');
  if (faqDropdowns.length === 0) {
    console.warn('No FAQ dropdowns found');
    return;
  }
  faqDropdowns.forEach((dropdown) => setupDropdown(dropdown));
  console.log(`Initialized ${faqDropdowns.length} FAQ dropdowns with animations`);
}

export function initFAQ() {
  addEnhancedStyles();
  initializeFAQAnimations();
  handleInitialState();

  // expose helpers for debugging / re-init
  (window as any).reinitializeFAQAnimations = () => {
    initializeFAQAnimations();
    handleInitialState();
  };
  (window as any).faqAnimationDebug = {
    config,
    initializeFAQAnimations,
    closeAllDropdowns,
  };
}
