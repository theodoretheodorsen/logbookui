import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';

const NEW_AIRCRAFT_VALUE = '__new__';

// datetime-local gives "YYYY-MM-DDTHH:MM"; the db stores full UTC timestamps
// as plain "YYYY-MM-DD HH:MM:SS" text (see schema.sql).
function toDbTimestamp(datetimeLocalValue) {
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}
function toDatetimeLocalValue(dbTimestamp) {
  return dbTimestamp ? dbTimestamp.slice(0, 16).replace(' ', 'T') : '';
}

// `onSaved(position)` is called after a successful add or edit, with the
// position the flight ended up at, so app.js can navigate to that page.
export function createFlightDialog({ onSaved }) {
  const dialog = el('flight-dialog');
  const form = el('flight-form');
  const aircraftSelect = el('flight-aircraft-select');
  const newAircraftFields = el('flight-new-aircraft-fields');

  let editingPosition = null;

  aircraftSelect.addEventListener('change', () => {
    newAircraftFields.hidden = aircraftSelect.value !== NEW_AIRCRAFT_VALUE;
  });
  el('flight-cancel').addEventListener('click', () => dialog.close());

  function populateAircraftSelect() {
    aircraftSelect.textContent = '';
    for (const aircraft of logbookApi.listAircraft()) {
      const option = document.createElement('option');
      option.value = aircraft.id;
      option.textContent = `${aircraft.registration} (${aircraft.type})`;
      aircraftSelect.appendChild(option);
    }
    const newOption = document.createElement('option');
    newOption.value = NEW_AIRCRAFT_VALUE;
    newOption.textContent = '+ New aircraft...';
    aircraftSelect.appendChild(newOption);
  }

  // `position` omitted -> Add mode; passed -> Edit mode, prefilled from that flight.
  function open(position) {
    clearError();
    populateAircraftSelect();
    newAircraftFields.hidden = true;
    editingPosition = position ?? null;
    el('flight-dialog-title').textContent = editingPosition ? 'Edit Flight' : 'Add Flight';
    el('flight-position').closest('label').hidden = Boolean(editingPosition);

    if (editingPosition) {
      const flight = logbookApi.getFlight(editingPosition);
      el('flight-position').value = '';
      el('flight-off-block').value = toDatetimeLocalValue(flight.off_block);
      el('flight-on-block').value = toDatetimeLocalValue(flight.on_block);
      el('flight-departure').value = flight.departure ?? '';
      el('flight-destination').value = flight.destination ?? '';
      aircraftSelect.value = String(flight.aircraft_id);
      el('flight-pic-name').value = flight.pic_name ?? '';
      el('flight-role').value = flight.role;
      el('flight-rules').value = flight.flight_rules;
      el('flight-day-landings').value = flight.day_landings ?? '';
      el('flight-night-landings').value = flight.night_landings ?? '';
      el('flight-remarks').value = flight.remarks ?? '';
    } else {
      form.reset();
    }

    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const data = {
      off_block: toDbTimestamp(el('flight-off-block').value),
      on_block: toDbTimestamp(el('flight-on-block').value),
      departure: el('flight-departure').value,
      destination: el('flight-destination').value,
      pic_name: el('flight-pic-name').value || null,
      role: el('flight-role').value,
      flight_rules: el('flight-rules').value,
      day_landings: el('flight-day-landings').value ? Number(el('flight-day-landings').value) : null,
      night_landings: el('flight-night-landings').value ? Number(el('flight-night-landings').value) : null,
      remarks: el('flight-remarks').value || '',
    };

    if (aircraftSelect.value === NEW_AIRCRAFT_VALUE) {
      data.aircraft = {
        registration: el('flight-new-registration').value,
        type: el('flight-new-type').value,
        pilot_operation: el('flight-new-pilot-operation').value,
        engine_configuration: el('flight-new-engine-configuration').value,
      };
    } else {
      data.aircraft_id = Number(aircraftSelect.value);
    }

    try {
      if (editingPosition) {
        logbookApi.updateFlight(editingPosition, data);
        dialog.close();
        onSaved(editingPosition);
      } else {
        const position = el('flight-position').value ? Number(el('flight-position').value) : null;
        if (position != null) data.position = position;
        const landedAt = logbookApi.addFlight(data);
        dialog.close();
        onSaved(landedAt);
      }
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
