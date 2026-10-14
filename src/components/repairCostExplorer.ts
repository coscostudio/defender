import {
  currency,
  FIGURE_LABEL,
  OWN_LABEL,
  PLAN_COST,
  PLAN_LABEL,
  renderMarkup,
  type Repair,
  REPAIRS,
} from './repairDiagram/content';
import { FIGURE_CSS } from './repairDiagram/figureCss.generated';

/**
 * Route 66 repair-cost explorer: a hybrid Webflow component.
 *
 * Webflow owns the panel: the heading, the price comparison, the list of repairs
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
// jsDelivr occasionally stalls or errors on the first request for a new release; past this
// delay the figure is also requested straight from GitHub, and whichever arrives first wins.
const FIGURE_BACKUP_DELAY_MS = 4000;
const JSDELIVR_GH =
  /^https:\/\/(?:cdn|fastly|gcore)\.jsdelivr\.net\/gh\/([^/]+)\/([^/@]+)@([^/]+)\//;

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

// The same file on raw.githubusercontent.com, when the bundle is served from jsDelivr's GitHub mirror.
function figureBackupUrl(root: HTMLElement) {
  if (root.dataset.figureSrc) return;
  const match = SCRIPT_SRC.match(JSDELIVR_GH);
  if (!match) return;
  const [, user, repo, ref] = match;
  const dir = new URL('.', SCRIPT_SRC).pathname.split(`@${ref}/`)[1] ?? '';
  return `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${dir}${FIGURE_FILE}`;
}

function fetchFigure(primary: string, backup?: string) {
  const controller = new AbortController();
  const get = (url: string) =>
    fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`figure ${response.status}`);
      return response.text();
    });

  const first = get(primary);
  if (!backup) return first;

  const second = new Promise<string>((resolve, reject) => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      get(backup).then(resolve, reject);
    };
    const timer = window.setTimeout(start, FIGURE_BACKUP_DELAY_MS);
    first.then(() => window.clearTimeout(timer), start);
  });

  return Promise.any([first, second]).finally(() => controller.abort());
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Read the repairs from the Webflow rows, falling back to the built-in list per field. */
// The plan price comes from a row's `data-ddx-plan-cost` attribute, else the plan default ($0).
function readRepairs(rows: HTMLElement[], planDefault: number): Repair[] {
  return rows.map((row) => {
    const plan = Number(row.dataset.ddxPlanCost);
    const id = row.dataset.ddxSelect ?? '';
    const known = REPAIRS.find((r) => r.id === id);
    const cost = Number(text(row.querySelector('.diagram_row-cost')).replace(/[^0-9.]/g, ''));
    return {
      id,
      name: text(row.querySelector('.diagram_row-name')) || known?.name || id,
      cost: Number.isFinite(cost) && cost > 0 ? cost : (known?.cost ?? 0),
      detail: text(row.querySelector('.diagram_row-detail')) || known?.detail || '',
      plan: row.dataset.ddxPlanCost && Number.isFinite(plan) ? plan : planDefault,
    };
  });
}

function figureMarkup(first: Repair) {
  return `
    <div class="ddx iso" data-theme="light">
      <div class="iso-plate ddx-plate">
        <div class="ddx-stage" data-ddx-stage tabindex="0" role="group" aria-label="${FIGURE_LABEL} Use the left and right arrow keys to step through them."></div>
        <div class="ddx-nav">
          <button type="button" class="ddx-step" data-ddx-step="-1" aria-label="Previous repair">←</button>
          <span class="ddx-current" data-readout aria-hidden="true">${first.name}</span>
          <button type="button" class="ddx-step" data-ddx-step="1" aria-label="Next repair">→</button>
        </div>
        <div class="ddx-compare">
          <div class="ddx-mini">
            <span class="ddx-mini-label">${OWN_LABEL}</span>
            <span class="ddx-mini-cost is-own" data-ddx-cost>${currency.format(first.cost)}</span>
          </div>
          <div class="ddx-mini is-plan">
            <span class="ddx-mini-label">${PLAN_LABEL}</span>
            <span class="ddx-mini-cost" data-ddx-plan>${currency.format(first.plan ?? PLAN_COST)}</span>
          </div>
        </div>
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
  const nameEl = root.querySelector<HTMLElement>('[data-ddx-name]');
  const detailEl = root.querySelector<HTMLElement>('[data-ddx-detail]');
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-ddx-select]'));
  if (!el || !slot || !rows.length) return;

  const repairs = readRepairs(rows, PLAN_COST);
  slot.innerHTML = figureMarkup(repairs[0]);
  // The price comparison lives in the figure card; the panel carries the one-line saving.
  const costEl = slot.querySelector<HTMLElement>('[data-ddx-cost]');
  const planEl = slot.querySelector<HTMLElement>('[data-ddx-plan]');
  const stage = slot.querySelector<HTMLElement>('[data-ddx-stage]');
  const readout = slot.querySelector<HTMLElement>('[data-readout]');
  const live = slot.querySelector<HTMLElement>('[data-ddx-live]');
  const steppers = Array.from(slot.querySelectorAll<HTMLButtonElement>('[data-ddx-step]'));
  const saveEl = root.querySelector<HTMLElement>('[data-ddx-save]');
  if (!stage || !costEl) return;

  // The rows behave as toggle buttons.
  rows.forEach((row, index) => {
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    const detail = row.querySelector<HTMLElement>('.diagram_row-detail');
    if (detail) {
      detail.id ||= `ddx-detail-${repairs[index].id}`;
      row.setAttribute('aria-describedby', detail.id);
    }
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
    if (nameEl) nameEl.textContent = name;
    if (detailEl) detailEl.textContent = repair.detail;
    tweenCost(cost);
    if (planEl) planEl.textContent = currency.format(repair.plan ?? PLAN_COST);
    if (saveEl) saveEl.textContent = currency.format(cost - (repair.plan ?? PLAN_COST));
    if (readout) readout.textContent = name;

    rows.forEach((row) => {
      const on = row.dataset.ddxSelect === id;
      row.classList.toggle(ACTIVE, on);
      row.setAttribute('aria-pressed', String(on));
    });
    paintFigure();
    if (announce && live)
      live.textContent = `${name}: ${currency.format(cost)} average repair cost, ${currency.format(repair.plan ?? PLAN_COST)} with a Route 66 plan.`;
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

  el.dataset.figure = 'loading';
  fetchFigure(figureUrl(root), figureBackupUrl(root))
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
.ddx.iso[data-theme="light"]{--anatomy-card:var(--base-color-brand--off-white-2-f5f4f1,#f5f4f1);--anatomy-paper:var(--anatomy-card);--anatomy-lit:#d94b16;--anatomy-halo-opacity:.18;--ddx-line:#dfdcd5;background:transparent;color:var(--anatomy-text);font-family:Inter,Arial,sans-serif;text-align:left}
.ddx *{box-sizing:border-box}
.ddx .iso-plate{padding:40px 18px 28px;border-radius:16px;background:transparent;box-shadow:none}
.ddx-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
.ddx-current{min-width:12ch;color:var(--anatomy-strong);font-size:17px;font-weight:600;line-height:1.2;letter-spacing:.01em;text-align:center}
.ddx-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:440px;margin:14px auto 0}
.ddx-mini{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--ddx-line);border-radius:12px;background:#fff}
.ddx-mini.is-plan{border-color:transparent;background:rgba(217,75,22,.08)}
.ddx-mini-label{color:var(--anatomy-muted);font-size:12.5px;font-weight:500;line-height:1.2}
.ddx-mini-cost{color:var(--anatomy-lit);font-size:26px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ddx-mini-cost.is-own{color:var(--anatomy-strong);opacity:.55;text-decoration:line-through;text-decoration-thickness:2px}
.ddx-step{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;flex:none;width:44px;height:44px;border:1px solid var(--ddx-line);border-radius:50%;background:#fff;color:var(--anatomy-strong);font-size:19px;line-height:1;cursor:pointer;transition:background-color .2s var(--anatomy-ease),border-color .2s var(--anatomy-ease),color .2s var(--anatomy-ease)}
.ddx-step:hover{border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ddx-step:focus-visible{outline:2px solid var(--anatomy-strong);outline-offset:2px}
.ddx-stage{position:relative;outline:none;aspect-ratio:960/540;cursor:default}
.ddx-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-strong);border-radius:8px}
.ddx-stage svg{display:block;width:100%;height:auto}
.ddx-stage [data-sys]{cursor:pointer}
[data-figure="error"] .ddx-stage{display:none}
[data-figure="loading"] .ddx-stage::after{content:"";position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid var(--ddx-line);border-top-color:var(--anatomy-muted);border-radius:50%;opacity:0;animation:ddx-spin .8s linear infinite,ddx-appear .2s .4s forwards}
@keyframes ddx-spin{to{transform:rotate(360deg)}}
@keyframes ddx-appear{to{opacity:1}}
.ddx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-ddx-select]:focus-visible{outline:2px solid #18181a;outline-offset:2px}
@media (max-width:767px){.ddx .iso-plate{padding:24px 6px 22px;overflow:hidden}.ddx .ddx-stage svg{width:116%;max-width:none;margin:0 0 0 -8%}.ddx-current{font-size:15px}.ddx-compare{margin:12px 8px 0}.ddx-mini{padding:10px 12px}.ddx-mini-cost{font-size:22px}}
`;
