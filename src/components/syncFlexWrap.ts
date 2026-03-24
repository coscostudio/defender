/**
 * Detects when .service-cards-component children wrap to a 2nd row and
 * switches .services-bullets-wrapper from column to row+wrap to match.
 */
export function initSyncFlexWrap() {
  const component = document.querySelector<HTMLElement>('.service-cards-component');
  const bullets = document.querySelector<HTMLElement>('.services-bullets-wrapper');
  if (!component || !bullets) return;

  const check = () => {
    const children = Array.from(component.children) as HTMLElement[];
    if (children.length < 2) return;
    const firstTop = children[0].getBoundingClientRect().top;
    const wrapped = children.slice(1).some((el) => el.getBoundingClientRect().top > firstTop + 1);
    bullets.style.flexDirection = wrapped ? 'row' : '';
    bullets.style.flexWrap = wrapped ? 'wrap' : '';
  };

  check();
  const ro = new ResizeObserver(check);
  ro.observe(component);
}
