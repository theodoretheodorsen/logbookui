import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { clearError } from '../error-banner.js';
import { restrictUppercase } from '../input-restrict.js';

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

  function populateDatalist(datalist, values) {
    datalist.textContent = '';
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      datalist.appendChild(option);
    }
  }

  function open() {
    clearError();
    form.reset();

    const aircraft = logbookApi.listAircraft();
    populateSelect(
      aircraftSelect,
      'Any aircraft',
      aircraft.map((a) => ({ value: a.registration, label: `${a.registration} (${a.type})` }))
    );
    const types = [...new Set(aircraft.map((a) => a.type))].sort();
    populateSelect(typeSelect, 'Any type', types.map((type) => ({ value: type, label: type })));

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
