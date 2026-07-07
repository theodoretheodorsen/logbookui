export const el = (id) => document.getElementById(id);

// Fills a <datalist> with one <option> per value, replacing whatever was
// there before - used to power text-input autocomplete suggestions (e.g.
// PIC name) from live data rather than a fixed list.
export function populateDatalist(datalist, values) {
  datalist.textContent = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  }
}
