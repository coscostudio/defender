function loadGsapIfNeeded(onReady: () => void) {
  if ((window as any).gsap) {
    onReady();
    return;
  }
  const gsapScript = document.createElement('script');
  gsapScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
  gsapScript.onload = onReady;
  document.head.appendChild(gsapScript);
}

export function initMobileNav() {
  const onDomReady = () => {
    loadGsapIfNeeded(initializeNavMenu);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
  } else {
    onDomReady();
  }

  function initializeNavMenu() {
    const { gsap } = window as any;
    if (!gsap) return;

    const navShow = document.getElementById('nav-show');
    const navHide = document.getElementById('nav-hide');
    const navMobile = document.querySelector<HTMLElement>('.nav-mobile');
    const navLinks = Array.from(document.querySelectorAll<HTMLElement>('.nav-mobile-link'));
    const navContainer = document.querySelector<HTMLElement>('.nav-container');

    if (!navShow || !navHide || !navMobile || !navContainer || navLinks.length === 0) return;

    const linkDuration = 0.28;
    const linkStagger = 0.07;

    let isOpen = false;
    let isAnimating = false;
    let outsideClickBound = false;
    let tl: any = null;
    let ro: ResizeObserver | null = null;

    const $navShow = navShow as HTMLElement;
    const $navHide = navHide as HTMLElement;
    const $navMobile = navMobile as HTMLElement;
    const $navContainer = navContainer as HTMLElement;

    gsap.set($navMobile, { display: 'none', height: 0, opacity: 0, overflow: 'hidden' });
    gsap.set(navLinks, { y: -20, opacity: 0 });

    function totalRevealTime() {
      return linkDuration + linkStagger * (navLinks.length - 1);
    }

    function measureFinalHeight() {
      const prev = {
        display: $navMobile.style.display,
        height: $navMobile.style.height,
        opacity: $navMobile.style.opacity,
        visibility: $navMobile.style.visibility,
        position: $navMobile.style.position,
        pointerEvents: $navMobile.style.pointerEvents,
      };

      gsap.set($navMobile, {
        display: 'flex',
        height: 'auto',
        opacity: 1,
        visibility: 'hidden',
        position: 'absolute',
        pointerEvents: 'none',
      });

      const original = navLinks.map((el) => ({
        y: gsap.getProperty(el, 'y'),
        opacity: gsap.getProperty(el, 'opacity'),
      }));
      gsap.set(navLinks, { y: 0, opacity: 1 });

      const h = Math.ceil($navMobile.scrollHeight);

      navLinks.forEach((el, i) => gsap.set(el, { y: original[i].y, opacity: original[i].opacity }));
      gsap.set($navMobile, prev);
      return h;
    }

    function bindOutsideClick() {
      if (outsideClickBound) return;
      document.addEventListener('click', handleOutsideClick);
      outsideClickBound = true;
    }

    function unbindOutsideClick() {
      if (!outsideClickBound) return;
      document.removeEventListener('click', handleOutsideClick);
      outsideClickBound = false;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!$navContainer.contains(event.target as Node)) {
        closeMobileMenu();
      }
    }

    function startHeightObserver() {
      if (ro) ro.disconnect();
      if (typeof ResizeObserver === 'undefined') return;
      ro = new ResizeObserver(() => {
        if (isOpen) {
          const h = Math.ceil($navMobile.scrollHeight);
          gsap.set($navMobile, { height: h });
        }
      });
      ro.observe($navMobile);
    }

    function stopHeightObserver() {
      if (ro) {
        ro.disconnect();
        ro = null;
      }
    }

    function openMobileMenu(e?: Event) {
      if (e) e.preventDefault();
      if (isAnimating || isOpen) return;
      isAnimating = true;
      $navShow.style.display = 'none';
      $navHide.style.display = 'flex';

      const finalHeight = measureFinalHeight();
      const heightDuration = totalRevealTime() + 0.08;

      gsap.set($navMobile, { display: 'flex', height: 0, opacity: 1 });

      if (tl) tl.kill();
      tl = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          isAnimating = false;
          isOpen = true;
          bindOutsideClick();
          startHeightObserver();
        },
      });

      tl.to($navMobile, { height: finalHeight, duration: heightDuration, ease: 'power1.out' }, 0);
      tl.to(
        navLinks,
        {
          opacity: 1,
          y: 0,
          duration: linkDuration,
          stagger: { each: linkStagger, from: 0 },
          ease: 'power2.out',
          onStart: () => navLinks.forEach((el) => (el.style.transition = 'none')),
          onComplete: () => navLinks.forEach((el) => (el.style.transition = '')),
        },
        0
      );
    }

    function closeMobileMenu(e?: Event) {
      if (e && e.currentTarget === navHide) e.preventDefault();
      if (isAnimating || !isOpen) return;
      isAnimating = true;
      unbindOutsideClick();
      stopHeightObserver();

      const currentHeight = Math.ceil($navMobile.scrollHeight);
      const linkOutDuration = Math.max(0.18, linkDuration * 0.8);
      const collapseTime = linkOutDuration + linkStagger * (navLinks.length - 1) + 0.06;

      gsap.set($navMobile, { height: currentHeight, overflow: 'hidden' });

      if (tl) tl.kill();
      tl = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          gsap.set($navMobile, { display: 'none', height: 0, opacity: 0 });
          $navShow.style.display = 'flex';
          $navHide.style.display = 'none';
          isAnimating = false;
          isOpen = false;
        },
      });

      tl.to(
        navLinks,
        {
          opacity: 0,
          y: -15,
          duration: linkOutDuration,
          stagger: { each: linkStagger, from: 'end' as any },
          ease: 'power1.in',
          onStart: () => navLinks.forEach((el) => (el.style.transition = 'none')),
          onComplete: () => navLinks.forEach((el) => (el.style.transition = '')),
        },
        0
      );

      tl.to($navMobile, { height: 0, duration: collapseTime, ease: 'power2.in' }, 0.02);
    }

    $navShow.addEventListener('click', openMobileMenu);
    $navHide.addEventListener('click', closeMobileMenu);
    navLinks.forEach((link) => link.addEventListener('mousedown', () => closeMobileMenu()));

    window.addEventListener('resize', () => {
      if (window.innerWidth > 991 && isOpen) closeMobileMenu();
    });

    // Expose for debugging if needed
    (window as any).mobileNav = { open: openMobileMenu, close: closeMobileMenu };
  }
}
