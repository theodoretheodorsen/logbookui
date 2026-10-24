import { el, populateDatalist } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';
import { isEditModeEnabled } from '../edit-mode.js';
import { HOME_BASE } from '../config.js';
import { restrictDigits, restrictUppercase } from '../input-restrict.js';
import { todayUtc, addDaysUtc } from '../date-utils.js';

const NEW_AIRCRAFT_VALUE = '__new__';

// The date and 24h time fields are kept as separate plain inputs rather than
// one <input type="datetime-local"> - that control's time portion renders in
// whatever 12h/24h format the OS locale prefers, which isn't overridable,
// whereas a plain "HHMM" text field with a strict pattern always is 24h.
function toDbTimestamp(dateValue, hhmm) {
  return `${dateValue} ${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00`;
}
function splitDbTimestamp(dbTimestamp) {
  if (!dbTimestamp) return { date: '', time: '' };
  const [date, time] = dbTimestamp.split(' ');
  return { date, time: time ? time.slice(0, 5).replace(':', '') : '' };
}

// Outbound/return flight pairs are usually consecutively numbered (e.g.
// "IB811" out, "IB812" back) - detects a flight number at the start of
// `remarks` (letters immediately followed by digits, e.g. "IB811 PICUS")
// and returns it incremented by one, preserving the original digit width
// (e.g. "IB0796" -> "IB0797"). Returns null if no flight number is found.
function nextFlightNumber(remarks) {
  const match = remarks?.match(/^([A-Z]+)(\d+)/);
  if (!match) return null;
  const [, carrier, digits] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${carrier}${next}`;
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

  restrictDigits(el('flight-off-block-time'), 4);
  restrictDigits(el('flight-on-block-time'), 4);
  restrictUppercase(el('flight-departure'), 4);
  restrictUppercase(el('flight-destination'), 4);
  // No max length - PIC names and remarks vary, unlike a fixed-width ICAO code.
  restrictUppercase(el('flight-pic-name'), Infinity);
  restrictUppercase(el('flight-remarks'), Infinity);

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
    populateDatalist(el('flight-pic-name-list'), logbookApi.listPicNames());
    newAircraftFields.hidden = true;
    editingPosition = position ?? null;
    el('flight-dialog-title').textContent = editingPosition ? 'Edit Flight' : 'Add Flight';
    // The position override is a structural, renumbering operation - same as
    // Edit/Delete, so it's also gated behind the edit-mode toggle.
    el('flight-position').closest('label').hidden = Boolean(editingPosition) || !isEditModeEnabled();

    if (editingPosition) {
      const flight = logbookApi.getFlight(editingPosition);
      el('flight-position').value = '';
      // Only off_block's date is shown/edited (the logbook only ever
      // displays one Date per entry - see logbook_page_report) - on_block's
      // original date is discarded and recomputed on save (see submit
      // handler below) from whether its time precedes off-block's.
      const off = splitDbTimestamp(flight.off_block);
      const on = splitDbTimestamp(flight.on_block);
      el('flight-date').value = off.date;
      el('flight-off-block-time').value = off.time;
      el('flight-on-block-time').value = on.time;
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
      const today = todayUtc();
      el('flight-date').value = today;

      const lastFlight = logbookApi.getLastFlight();
      if (lastFlight) {
        const endedAwayFromHome = lastFlight.destination !== HOME_BASE;
        if (endedAwayFromHome) {
          el('flight-departure').value = lastFlight.destination ?? '';
          el('flight-destination').value = HOME_BASE;
          const nextFlightNo = nextFlightNumber(lastFlight.remarks);
          if (nextFlightNo) el('flight-remarks').value = nextFlightNo;
        } else {
          el('flight-departure').value = HOME_BASE;
          el('flight-destination').value = '';
        }
        aircraftSelect.value = String(lastFlight.aircraft_id);

        // Same PIC is likely if this is a continuation: either still the same
        // day, or the next day picking up from where the last flight left off
        // (away from home base) - but not after a longer gap, and not for a
        // fresh day starting back at home base.
        const lastDate = splitDbTimestamp(lastFlight.off_block).date;
        const sameDay = today === lastDate;
        const nextDayAwayFromHome = endedAwayFromHome && today === addDaysUtc(lastDate, 1);
        if (sameDay || nextDayAwayFromHome) {
          el('flight-pic-name').value = lastFlight.pic_name ?? '';
        }
      } else {
        el('flight-departure').value = HOME_BASE;
      }
    }

    dialog.showModal();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const date = el('flight-date').value;
    const offBlockTime = el('flight-off-block-time').value;
    const onBlockTime = el('flight-on-block-time').value;
    // A flight landing after midnight UTC has an on-block time that's
    // numerically smaller than off-block's - e.g. off 2300, on 0200. That's
    // the only signal available (there's no separate "crossed midnight"
    // checkbox), so it's treated as having landed the following day.
    const onBlockDate = onBlockTime < offBlockTime ? addDaysUtc(date, 1) : date;
    const data = {
      off_block: toDbTimestamp(date, offBlockTime),
      on_block: toDbTimestamp(onBlockDate, onBlockTime),
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

    // Saving now always resolves night_minutes, which may attempt a live
    // network lookup (see lib/airports.js) - disable Save while that's in
    // flight so a flaky connection can't lead to a double-submit.
    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      if (editingPosition) {
        await logbookApi.updateFlight(editingPosition, data);
        dialog.close();
        onSaved(editingPosition);
      } else {
        const position = el('flight-position').value ? Number(el('flight-position').value) : null;
        if (position != null) data.position = position;
        const landedAt = await logbookApi.addFlight(data);
        dialog.close();
        onSaved(landedAt);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });

  return { open };
}
