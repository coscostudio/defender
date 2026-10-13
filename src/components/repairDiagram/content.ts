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
  /** What a Route 66 member pays for the covered repair (their deductible). */
  plan?: number;
};

// Retail averages for parts and labor, from the Route 66 Extended Warranty sales sheet (2026).
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
    id: 'alternator',
    name: 'Alternator',
    cost: 1091,
    detail: 'Charges the battery and powers the electrics whenever the engine runs.',
  },
];

// Route 66 plans carry a $0 deductible: an approved, covered repair costs the member nothing.
export const PLAN_COST = 0;
export const OWN_LABEL = 'Repair bill on your own';
export const PLAN_LABEL = 'With Route 66';

export const HEADING = 'See what one breakdown can cost.';
export const CAPTION =
  'Parts pricing is based on an average of actual repairs at a retail rate for parts and labor. Actual repair costs may vary by repair facility, vehicle, and location. With a Route 66 plan, covered repairs carry a $0 deductible once Route 66 approves the claim.';
export const FIGURE_LABEL =
  'Cutaway illustration of a crossover SUV showing where nine common repairs sit: engine, transmission, drive axle, A/C compressor, water pump, fuel pump, power steering, navigation and alternator.';

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
  const plan = first.plan ?? PLAN_COST;
  const on = (index: number) => (index === 0 ? ' is-active' : '');
  const rows = REPAIRS.map(
    (r, i) => `
      <li class="diagram_item"><div class="diagram_row${on(i)}" data-ddx-select="${r.id}">
        <div class="diagram_row-name">${escapeHtml(r.name)}</div>
        <div class="diagram_row-cost">${currency.format(r.cost)}</div>
        <p class="diagram_row-detail">${escapeHtml(r.detail)}</p>
      </div></li>`
  ).join('');
  return `
    <div class="diagram_layout" data-ddx>
      <div class="diagram_figure" data-ddx-figure></div>
      <div class="diagram_panel">
        <h2 class="diagram_title">${escapeHtml(HEADING)}</h2>
        <p class="diagram_save"><span class="diagram_save-name" data-ddx-name>${escapeHtml(first.name)}</span> – Save <span data-ddx-save>${currency.format(first.cost - plan)}</span> on a covered repair</p>
        <p class="diagram_detail" data-ddx-detail>${escapeHtml(first.detail)}</p>
        <ul role="list" class="diagram_list">${rows}</ul>
      </div>
      <p class="diagram_caption" data-ddx-caption>${escapeHtml(CAPTION)}</p>
    </div>`;
}
