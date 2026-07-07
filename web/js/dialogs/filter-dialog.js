import { el, populateDatalist } from '../dom.js';
import { logbookApi, AIRCRAFT_FAMILIES } from '../logbook-api.js';
import { clearError } from '../error-banner.js';
import { restrictUppercase } from '../input-restrict.js';
import {
  todayUtc,
  addDaysUtc,
  addMonthsUtc,
  startOfYearUtc,
  monthsAgoUtc,
  endOfMonthUtc,
  monthLabelUtc,
} from '../date-utils.js';

// `onApply(filters)` is called with `{ pic, registration, aircraftType, role,
// kind, airport, from, to }` (only whichever fields were actually filled in)
// when the form is submitted; `onClear()` when "Clear filter" is clicked.
// app.js owns what "applying"/"clearing" actually means for the on-screen view.
export function createFilterDialog({ onApply, onClear }) {
  const dialog = el('filter-dialog');
  const form = el('filter-form');
  const aircraftSelect = el('filter-aircraft-select');
  const typeSelect = el('filter-aircraft-type-select');
  const picList = el('filter-pic-name-list');
  const airportList = el('filter-airport-list');

  restrictUppercase(el('filter-airport'), 4);

  el('filter-cancel').addEventListener('click', () => dialog.close());
  el('filter-clear').addEventListener('click', () => {
    dialog.close();
    onClear();
  });

  // Quick EASA FTL comparison ranges (ORO.FTL.210: 100h/28 days, 900h/
  // calendar year, 1000h/12 months) - fills the From/To fields and applies
  // immediately (same path as pressing Apply), so it's a one-tap "where do
  // I stand against the limit" check rather than just prefilling the form.
  // Any other filter already set (PIC, aircraft, ...) is left alone.
  function applyQuickRange(from, to) {
    el('filter-date-from').value = from;
    el('filter-date-to').value = to;
    form.requestSubmit();
  }

  el('filter-quick-28d').addEventListener('click', () => {
    const to = todayUtc();
    applyQuickRange(addDaysUtc(to, -27), to);
  });
  el('filter-quick-year').addEventListener('click', () => {
    const to = todayUtc();
    applyQuickRange(startOfYearUtc(to), to);
  });
  el('filter-quick-12m').addEventListener('click', () => {
    const to = todayUtc();
    applyQuickRange(addMonthsUtc(to, -12), to);
  });

  // "July 2026"/"June 2026"/"May 2026" style quick filters for the current
  // and two preceding calendar months. Recomputed on every open() (rather
  // than wired once like the EASA buttons above) since both the label and
  // the date range depend on today's date, and this dialog can be left
  // open across a month boundary. Uses .onclick (not addEventListener) so
  // re-running this on each open() replaces the previous handler instead
  // of stacking a duplicate one.
  const MONTH_QUICK_BUTTON_IDS = ['filter-quick-month-0', 'filter-quick-month-1', 'filter-quick-month-2'];

  function populateMonthQuickButtons() {
    const today = todayUtc();
    MONTH_QUICK_BUTTON_IDS.forEach((id, monthsAgo) => {
      const button = el(id);
      const monthStart = monthsAgoUtc(today, monthsAgo);
      button.textContent = monthLabelUtc(monthStart);
      button.onclick = () => {
        const to = monthsAgo === 0 ? today : endOfMonthUtc(monthStart);
        applyQuickRange(monthStart, to);
      };
    });
  }

  function populateSelect(select, defaultLabel, options) {
    select.textContent = '';
    const anyOption = document.createElement('option');
    anyOption.value = '';
    anyOption.textContent = defaultLabel;
    select.appendChild(anyOption);
    for (const { value, label } of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
  }

  // Families (A320 family, 737 family, ...) go in their own optgroup above
  // the real types actually flown, so picking one filters every member type
  // at once (see AIRCRAFT_FAMILIES/buildConditions in lib/export.js) without
  // hiding the exact-type options a pilot might still want.
  function populateTypeSelect(select, types) {
    select.textContent = '';
    const anyOption = document.createElement('option');
    anyOption.value = '';
    anyOption.textContent = 'Any type';
    select.appendChild(anyOption);

    const familyGroup = document.createElement('optgroup');
    familyGroup.label = 'Families';
    for (const family of Object.keys(AIRCRAFT_FAMILIES)) {
      const option = document.createElement('option');
      option.value = family;
      option.textContent = family;
      familyGroup.appendChild(option);
    }
    select.appendChild(familyGroup);

    const typeGroup = document.createElement('optgroup');
    typeGroup.label = 'Types';
    for (const type of types) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeGroup.appendChild(option);
    }
    select.appendChild(typeGroup);
  }

  function open() {
    clearError();
    form.reset();
    populateMonthQuickButtons();

    const aircraft = logbookApi.listAircraft();
    populateSelect(
      aircraftSelect,
      'Any aircraft',
      aircraft.map((a) => ({ value: a.registration, label: `${a.registration} (${a.type})` }))
    );
    const types = [...new Set(aircraft.map((a) => a.type))].sort();
    populateTypeSelect(typeSelect, types);

    populateDatalist(picList, logbookApi.listPicNames());
    populateDatalist(airportList, logbookApi.listAirports());

    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const filters = {
      pic: el('filter-pic-name').value || undefined,
      registration: aircraftSelect.value || undefined,
      aircraftType: typeSelect.value || undefined,
      role: el('filter-role-select').value || undefined,
      kind: el('filter-kind-select').value || undefined,
      airport: el('filter-airport').value || undefined,
      from: el('filter-date-from').value || undefined,
      to: el('filter-date-to').value || undefined,
    };

    dialog.close();
    onApply(filters);
  });

  return { open };
}
