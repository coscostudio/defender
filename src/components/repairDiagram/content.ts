/**
 * Content for the Route 66 repair-cost explorer.
 *
 * On the site the panel is native Webflow markup (classes `diagram_*`, hooks `data-ddx-*`);
 * the component reads each repair's name, price and description from that markup, so they
 * can be edited in the Designer. `REPAIRS` is the fallback for pages without the markup, and
 * `renderMarkup()` reproduces the same structure there.
 */

export type Repair = {
  id: string;
  name: string;
  cost: number;
  detail: string;
};

// Retail averages for parts and labor, from the Route 66 Extended Warranty sales sheet (2026).
// Suspension is not on the sheet: its figure is the midpoint of RepairPal's 2025 strut
// replacement estimates for comparable crossovers.
export const REPAIRS: Repair[] = [
  {
    id: 'engine',
    name: 'Engine',
    cost: 6278,
    detail: 'Block, head and valvetrain: the largest single repair most drivers ever face.',
  },
  {
    id: 'transmission',
    name: 'Transmission',
    cost: 3289,
    detail: 'Internal gearbox work pairs specialized labor with costly hard parts.',
  },
  {
    id: 'drive-axle',
    name: 'Drive axle',
    cost: 1990,
    detail: 'The rear differential and half shafts that carry power to the wheels.',
  },
  {
    id: 'ac-compressor',
    name: 'A/C compressor',
    cost: 1787,
    detail: 'Belt-driven pump for the cooling system: parts plus a refrigerant recharge.',
  },
  {
    id: 'water-pump',
    name: 'Water pump',
    cost: 1273,
    detail: 'Circulates coolant through the engine; often buried behind the accessory drive.',
  },
  {
    id: 'fuel-pump',
    name: 'Fuel pump',
    cost: 1252,
    detail: 'Sits inside the tank under the rear seat, so the tank usually has to come out.',
  },
  {
    id: 'power-steering',
    name: 'Power steering motor',
    cost: 1241,
    detail: 'The electric assist motor on the steering column, with its control electronics.',
  },
  {
    id: 'navigation',
    name: 'GPS / navigation',
    cost: 1174,
    detail: 'The dash display, head unit and roof antenna are built into the vehicle.',
  },
  {
    id: 'suspension',
    name: 'Suspension',
    cost: 1140,
    detail: 'Struts, springs and control arms that keep the tires planted and the ride steady.',
  },
  {
    id: 'alternator',
    name: 'Alternator',
    cost: 1091,
    detail: 'Charges the battery and powers the electrics whenever the engine runs.',
  },
];

export const HEADING = 'See what one breakdown can cost.';
export const CAPTION =
  'Parts pricing is based on an average of actual repairs at a retail rate for parts and labor. Actual repair costs may vary by repair facility, vehicle, and location.';
export const FIGURE_LABEL =
  'Cutaway illustration of a crossover SUV showing where ten common repairs sit: engine, transmission, drive axle, A/C compressor, water pump, fuel pump, power steering, navigation, suspension and alternator.';

export const currency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The section's markup, in the same structure the Webflow page uses. */
export function renderMarkup() {
  const first = REPAIRS[0];
  const on = (index: number) => (index === 0 ? ' is-active' : '');
  const bars = REPAIRS.map(
    (r, i) => `<div class="diagram_bar${on(i)}" data-ddx-bar="${r.id}"></div>`
  ).join('');
  const rows = REPAIRS.map(
    (r, i) => `
      <li class="diagram_item"><div class="diagram_row${on(i)}" data-ddx-select="${r.id}">
        <div class="diagram_row-name">${escapeHtml(r.name)}</div>
        <div class="diagram_row-meter"><div class="diagram_row-fill${on(i)}"></div></div>
        <div class="diagram_row-cost">${currency.format(r.cost)}</div>
        <p class="diagram_row-detail">${escapeHtml(r.detail)}</p>
      </div></li>`
  ).join('');
  return `
    <div class="diagram_layout" data-ddx>
      <div class="diagram_figure" data-ddx-figure></div>
      <div class="diagram_panel">
        <h2 class="diagram_title">${escapeHtml(HEADING)}</h2>
        <div class="diagram_reading">
          <div class="diagram_cost" data-ddx-cost>${currency.format(first.cost)}</div>
          <div class="diagram_name" data-ddx-name>${escapeHtml(first.name)}</div>
        </div>
        <div class="diagram_bars">${bars}</div>
        <p class="diagram_detail" data-ddx-detail>${escapeHtml(first.detail)}</p>
        <ul role="list" class="diagram_list">${rows}</ul>
      </div>
      <p class="diagram_caption" data-ddx-caption>${escapeHtml(CAPTION)}</p>
    </div>`;
}
