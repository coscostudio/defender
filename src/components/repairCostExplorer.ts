import {
  currency,
  FIGURE_LABEL,
  renderMarkup,
  type Repair,
  REPAIRS,
} from './repairDiagram/content';
import { FIGURE_CSS } from './repairDiagram/figureCss.generated';

/**
 * Route 66 repair-cost explorer: a hybrid Webflow component.
 *
 * Webflow owns the panel: the heading, the price reading, the cost bars, the list of repairs
 * and the pricing note are native elements (`diagram_*` classes, `data-ddx-*` hooks), so they
 * are crawlable and editable in the Designer. Each row's name, price and description are read
 * from that markup. The code owns the figure: it fills `[data-ddx-figure]` with the card and the
 * isometric SVG (built by `figures/suv/build.mjs`, published next to the bundle as
 * `repair-suv.svg`, every repair system tagged `data-sys`), and keeps the two in step by
 * toggling Webflow's `is-active` combo classes.
 *
 * Mounts into `[data-vsc-repair-diagram]` (fallback: `.section_diagram .component-diagram`).
 * Without the Webflow markup it renders the same structure itself.
 */

const ROOT_SELECTOR = '[data-vsc-repair-diagram], .section_diagram .component-diagram';
const STYLE_ID = 'dd-repair-explorer-styles';
const FIGURE_FILE = 'repair-suv.svg';
const ACTIVE = 'is-active';
const TOUR_STEP_MS = 3600;
const TOUR_RESUME_MS = 9000;

// Captured while the bundle executes, so the figure loads from wherever the bundle is served.
const SCRIPT_SRC = (document.currentScript as HTMLScriptElement | null)?.src ?? '';

const mounted = new WeakSet<HTMLElement>();

export function initRepairCostExplorer() {
  document.querySelectorAll<HTMLElement>(ROOT_SELECTOR).forEach(mount);
}

function figureUrl(root: HTMLElement) {
  const override = root.dataset.figureSrc;
  if (override) return override;
  try {
    return new URL(FIGURE_FILE, SCRIPT_SRC || window.location.href).href;
  } catch {
    return FIGURE_FILE;
  }
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Read the repairs from the Webflow rows, falling back to the built-in list per field. */
function readRepairs(rows: HTMLElement[]): Repair[] {
  return rows.map((row) => {
    const id = row.dataset.ddxSelect ?? '';
    const known = REPAIRS.find((r) => r.id === id);
    const cost = Number(text(row.querySelector('.diagram_row-cost')).replace(/[^0-9.]/g, ''));
    return {
      id,
      name: text(row.querySelector('.diagram_row-name')) || known?.name || id,
      cost: Number.isFinite(cost) && cost > 0 ? cost : (known?.cost ?? 0),
      detail: text(row.querySelector('.diagram_row-detail')) || known?.detail || '',
    };
  });
}

function figureMarkup(first: Repair) {
  return `
    <div class="ddx iso" data-theme="light">
      <div class="iso-plate ddx-plate">
        <div class="iso-plate-corners">
          <span class="iso-plate-corner" data-corner="hint">
            <span>Point at a part</span>
            <button type="button" class="ddx-step" data-ddx-step="-1" aria-label="Previous repair">←</button>
            <button type="button" class="ddx-step" data-ddx-step="1" aria-label="Next repair">→</button>
          </span>
          <span class="iso-plate-corner" data-corner="readout" data-readout aria-hidden="true">${first.name.toLowerCase()} · ${currency.format(first.cost)}</span>
        </div>
        <div class="ddx-stage" data-ddx-stage tabindex="0" role="group" aria-label="${FIGURE_LABEL} Use the left and right arrow keys to step through them."></div>
      </div>
      <p class="ddx-sr" aria-live="polite" data-ddx-live></p>
    </div>`;
}

function mount(root: HTMLElement) {
  if (mounted.has(root)) return;
  mounted.add(root);
  ensureStyles();

  root.setAttribute('data-vsc-repair-mounted', 'true');
  if (!root.querySelector('[data-ddx]')) root.innerHTML = renderMarkup();

  const el = root.querySelector<HTMLElement>('[data-ddx]');
  const slot = root.querySelector<HTMLElement>('[data-ddx-figure]');
  const costEl = root.querySelector<HTMLElement>('[data-ddx-cost]');
  const nameEl = root.querySelector<HTMLElement>('[data-ddx-name]');
  const detailEl = root.querySelector<HTMLElement>('[data-ddx-detail]');
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-ddx-select]'));
  if (!el || !slot || !costEl || !nameEl || !detailEl || !rows.length) return;

  const repairs = readRepairs(rows);
  const max = Math.max(...repairs.map((r) => r.cost));
  slot.innerHTML = figureMarkup(repairs[0]);
  const stage = slot.querySelector<HTMLElement>('[data-ddx-stage]');
  const readout = slot.querySelector<HTMLElement>('[data-readout]');
  const live = slot.querySelector<HTMLElement>('[data-ddx-live]');
  const steppers = Array.from(slot.querySelectorAll<HTMLButtonElement>('[data-ddx-step]'));
  const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-ddx-bar]'));
  if (!stage) return;

  // The rows behave as toggle buttons; their meters and the cost bars are scaled by price.
  rows.forEach((row, index) => {
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    const fill = row.querySelector<HTMLElement>('.diagram_row-fill');
    if (fill) fill.style.width = `${((repairs[index].cost / max) * 100).toFixed(1)}%`;
    const detail = row.querySelector<HTMLElement>('.diagram_row-detail');
    if (detail) {
      detail.id ||= `ddx-detail-${repairs[index].id}`;
      row.setAttribute('aria-describedby', detail.id);
    }
  });
  bars.forEach((bar) => {
    const repair = repairs.find((r) => r.id === bar.dataset.ddxBar);
    if (repair) bar.style.flexGrow = String(repair.cost);
  });

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let items: Element[] = [];
  let active = repairs[0].id;
  let shownCost = repairs[0].cost;
  let costFrame = 0;
  let tourTimer = 0;
  let resumeTimer = 0;
  let inView = false;
  let touched = false;

  const paintFigure = () => {
    items.forEach((item) => {
      const on = item.getAttribute('data-sys') === active;
      item.toggleAttribute('data-on', on);
      item.querySelectorAll('.iso-solid').forEach((solid) => solid.toggleAttribute('data-lit', on));
    });
  };

  const tweenCost = (to: number) => {
    cancelAnimationFrame(costFrame);
    const from = shownCost;
    if (still.matches || from === to) {
      shownCost = to;
      costEl.textContent = currency.format(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const eased = 1 - (1 - t) ** 3;
      shownCost = Math.round(from + (to - from) * eased);
      costEl.textContent = currency.format(shownCost);
      if (t < 1) costFrame = requestAnimationFrame(step);
    };
    costFrame = requestAnimationFrame(step);
  };

  const select = (id: string, { announce = false, force = false } = {}) => {
    if (id === active && !force) return;
    const repair = repairs.find((r) => r.id === id);
    if (!repair) return;
    active = id;
    const { cost, name } = repair;

    el.dataset.active = id;
    nameEl.textContent = name;
    detailEl.textContent = repair.detail;
    tweenCost(cost);
    if (readout) readout.textContent = `${name.toLowerCase()} · ${currency.format(cost)}`;

    rows.forEach((row) => {
      const on = row.dataset.ddxSelect === id;
      row.classList.toggle(ACTIVE, on);
      row.querySelector('.diagram_row-fill')?.classList.toggle(ACTIVE, on);
      row.setAttribute('aria-pressed', String(on));
    });
    bars.forEach((bar) => bar.classList.toggle(ACTIVE, bar.dataset.ddxBar === id));
    paintFigure();
    if (announce && live)
      live.textContent = `${name}: ${currency.format(cost)} average repair cost.`;
  };

  const step = (by: number) => {
    const index = repairs.findIndex((r) => r.id === active);
    select(repairs[(Math.max(0, index) + by + repairs.length) % repairs.length].id, {
      announce: true,
    });
  };

  // Idle tour: walks the repairs while the figure is on screen and nobody is using it.
  const stopTour = () => {
    window.clearInterval(tourTimer);
    tourTimer = 0;
  };
  const startTour = () => {
    stopTour();
    if (still.matches || !inView || touched) return;
    tourTimer = window.setInterval(() => step(1), TOUR_STEP_MS);
  };
  const pauseTour = () => {
    touched = true;
    stopTour();
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      touched = false;
      startTour();
    }, TOUR_RESUME_MS);
  };

  rows.forEach((row) => {
    const id = row.dataset.ddxSelect ?? '';
    row.addEventListener('click', () => {
      pauseTour();
      select(id, { announce: true });
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      pauseTour();
      select(id, { announce: true });
    });
    row.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      pauseTour();
      select(id);
    });
    row.addEventListener('focus', () => {
      pauseTour();
      select(id);
    });
  });

  // Pointing at a part in the drawing selects its system.
  const pickAt = (target: EventTarget | null) => {
    const sys = (target as Element | null)?.closest?.('[data-sys]')?.getAttribute('data-sys');
    if (sys && sys !== active) select(sys, { announce: true });
    return Boolean(sys);
  };
  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (pickAt(event.target)) pauseTour();
  });
  stage.addEventListener('click', (event) => {
    if (pickAt(event.target)) pauseTour();
  });
  steppers.forEach((button) =>
    button.addEventListener('click', () => {
      pauseTour();
      step(Number(button.dataset.ddxStep) || 1);
    })
  );
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    pauseTour();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) startTour();
        else stopTour();
      },
      { threshold: 0.35 }
    ).observe(el);
  }
  still.addEventListener?.('change', () => (still.matches ? stopTour() : startTour()));

  select(active, { force: true });

  fetch(figureUrl(root))
    .then((response) => {
      if (!response.ok) throw new Error(`figure ${response.status}`);
      return response.text();
    })
    .then((svg) => {
      stage.innerHTML = svg;
      stage.querySelector('svg')?.setAttribute('focusable', 'false');
      items = Array.from(stage.querySelectorAll('[data-sys]'));
      el.dataset.figure = 'ready';
      paintFigure();
    })
    .catch(() => {
      el.dataset.figure = 'error';
    });
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FIGURE_CSS + FIGURE_CARD_CSS;
  document.head.appendChild(style);
}

// The card around the drawing. The panel's styles live in Webflow (`diagram_*` classes).
const FIGURE_CARD_CSS = `
.ddx.iso[data-theme="light"]{--anatomy-card:#f5f4f1;--anatomy-paper:#f5f4f1;--anatomy-lit:#d94b16;--anatomy-halo-opacity:.18;--ddx-line:#dfdcd5;background:transparent;color:var(--anatomy-text);font-family:Inter,Arial,sans-serif;text-align:left}
.ddx *{box-sizing:border-box}
.ddx .iso-plate{padding:46px 18px 40px;border-radius:16px;background:var(--anatomy-card);box-shadow:0 1px 2px rgba(24,24,26,.06),0 8px 24px rgba(24,24,26,.06)}
.ddx .iso-plate-corner{font-family:inherit;font-size:10.5px;line-height:1;text-transform:uppercase}
.ddx .iso-plate-corner[data-corner="hint"]{display:flex;align-items:center;gap:2px;color:var(--anatomy-muted);letter-spacing:.1em}
.ddx .iso-plate-corner[data-corner="readout"]{color:var(--anatomy-text);letter-spacing:.04em}
.ddx-step{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;min-width:24px;height:24px;margin:-7px 0;border-radius:6px;color:var(--anatomy-text);font-size:13px;letter-spacing:0;cursor:pointer;pointer-events:auto;transition:background-color .2s var(--anatomy-ease),color .2s var(--anatomy-ease)}
.ddx-step:first-of-type{margin-left:4px}
.ddx-step:hover{background:var(--ddx-line);color:var(--anatomy-strong)}
.ddx-step:focus-visible{outline:2px solid var(--anatomy-strong);outline-offset:1px}
.ddx-stage{position:relative;outline:none;aspect-ratio:960/540;cursor:default}
.ddx-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-strong);border-radius:8px}
.ddx-stage svg{display:block;width:100%;height:auto}
.ddx-stage [data-sys]{cursor:pointer}
[data-figure="error"] .ddx-stage{display:none}
.ddx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-ddx-select]:focus-visible{outline:2px solid #18181a;outline-offset:2px}
@media (max-width:767px){.ddx .iso-plate{padding:36px 6px 44px;overflow:hidden}.ddx-stage svg{width:116%;margin:0 -8%}}
`;
