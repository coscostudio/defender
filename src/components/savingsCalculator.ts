const CALCULATOR_SELECTOR = '[data-savings-calculator]';
const INPUT_SELECTOR = '[data-savings-input]';
const DECREASE_SELECTOR = '[data-savings-decrease]';
const INCREASE_SELECTOR = '[data-savings-increase]';
const VALUE_SELECTOR = '[data-savings-value]';
const VEHICLE_LABEL_SELECTOR = '[data-savings-vehicle-label]';
const ANNUAL_SELECTOR = '[data-savings-annual]';
const MONTHLY_SELECTOR = '[data-savings-monthly]';
const DESCRIPTION_SELECTOR = '[data-savings-description]';
const FILL_SELECTOR = '[data-savings-fill]';
const HANDLE_SELECTOR = '[data-savings-handle]';
const PROGRESS_ATTR = '--savings-progress';
const SLIDER_EDGE_OFFSET = 16;
const DEFAULT_MIN = 1;
const DEFAULT_MAX = 7;
const DEFAULT_VALUE = 3;
const DEFAULT_ANNUAL_SAVINGS_PER_VEHICLE = 180;
const initializedCalculators = new WeakSet<HTMLElement>();
type SavingsStepControl = HTMLAnchorElement | HTMLButtonElement;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

export function initSavingsCalculator() {
  const calculators = document.querySelectorAll<HTMLElement>(CALCULATOR_SELECTOR);
  if (!calculators.length) return;

  calculators.forEach(initCalculator);
}

function initCalculator(calculator: HTMLElement) {
  if (initializedCalculators.has(calculator)) return;

  const input = calculator.querySelector<HTMLInputElement>(INPUT_SELECTOR);
  if (!input) return;

  initializedCalculators.add(calculator);

  const decreaseButton = calculator.querySelector<SavingsStepControl>(DECREASE_SELECTOR);
  const increaseButton = calculator.querySelector<SavingsStepControl>(INCREASE_SELECTOR);
  const valueElement = calculator.querySelector<HTMLElement>(VALUE_SELECTOR);
  const vehicleLabelElement = calculator.querySelector<HTMLElement>(VEHICLE_LABEL_SELECTOR);
  const annualElement = calculator.querySelector<HTMLElement>(ANNUAL_SELECTOR);
  const monthlyElement = calculator.querySelector<HTMLElement>(MONTHLY_SELECTOR);
  const descriptionElement = calculator.querySelector<HTMLElement>(DESCRIPTION_SELECTOR);
  const fillElement = calculator.querySelector<HTMLElement>(FILL_SELECTOR);
  const handleElement = calculator.querySelector<HTMLElement>(HANDLE_SELECTOR);
  const min = readNumber(input.min || calculator.dataset.savingsMin, DEFAULT_MIN);
  const max = readNumber(input.max || calculator.dataset.savingsMax, DEFAULT_MAX);
  const savingsPerVehicle = readNumber(
    calculator.dataset.savingsPerYear,
    DEFAULT_ANNUAL_SAVINGS_PER_VEHICLE
  );

  input.min = String(min);
  input.max = String(max);
  input.step = input.step || '1';
  configureStepControl(decreaseButton);
  configureStepControl(increaseButton);

  const render = (nextValue: number) => {
    const vehicles = clamp(Math.round(nextValue), min, max);
    const annualSavings = vehicles * savingsPerVehicle;
    const monthlySavings = annualSavings / 12;
    const progress = max === min ? 100 : ((vehicles - min) / (max - min)) * 100;
    const visualPosition = getSliderVisualPosition(progress);

    input.value = String(vehicles);
    input.setAttribute('aria-valuetext', `${vehicles} ${vehicleCopy(vehicles)}`);
    calculator.style.setProperty(PROGRESS_ATTR, `${progress}%`);

    if (fillElement) fillElement.style.width = visualPosition;
    if (handleElement) handleElement.style.left = visualPosition;
    if (valueElement) valueElement.textContent = String(vehicles);
    if (vehicleLabelElement) vehicleLabelElement.textContent = vehicleCopy(vehicles);
    if (annualElement) annualElement.textContent = currencyFormatter.format(annualSavings);
    if (monthlyElement) monthlyElement.textContent = currencyFormatter.format(monthlySavings);
    if (descriptionElement) {
      descriptionElement.textContent = `${currencyFormatter.format(
        annualSavings
      )} is the estimated annual premium savings for ${vehicles} ${vehicleCopy(
        vehicles
      )} when moving from a $500 to a $1,000 collision deductible.`;
    }

    syncButton(decreaseButton, vehicles <= min);
    syncButton(increaseButton, vehicles >= max);
  };

  decreaseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    render(Number(input.value) - 1);
  });
  increaseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    render(Number(input.value) + 1);
  });
  input.addEventListener('input', () => render(Number(input.value)));
  input.addEventListener('change', () => render(Number(input.value)));

  render(readNumber(input.value, DEFAULT_VALUE));
}

function readNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSliderVisualPosition(progress: number) {
  const boundedProgress = clamp(progress, 0, 100);
  const offset = SLIDER_EDGE_OFFSET - SLIDER_EDGE_OFFSET * 2 * (boundedProgress / 100);
  const sign = offset < 0 ? '-' : '+';
  return `calc(${boundedProgress}% ${sign} ${Math.abs(offset).toFixed(2)}px)`;
}

function syncButton(button: SavingsStepControl | null, isDisabled: boolean) {
  if (!button) return;

  if ('disabled' in button) button.disabled = isDisabled;

  button.classList.toggle('dd-step-disabled', isDisabled);
  button.classList.toggle('ddf-step-disabled', isDisabled);
  button.classList.toggle('ddx-step-disabled', isDisabled);
  button.classList.toggle('ddz-step-disabled', isDisabled);
  button.classList.toggle('ddv-step-disabled', isDisabled);
  button.setAttribute('aria-disabled', String(isDisabled));
}

function configureStepControl(control: SavingsStepControl | null) {
  if (!control) return;

  control.setAttribute('role', 'button');
  if (control instanceof HTMLAnchorElement) {
    control.setAttribute('tabindex', '0');
  }
}

function vehicleCopy(count: number) {
  return count === 1 ? 'insured vehicle' : 'insured vehicles';
}
