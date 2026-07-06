import { el } from './dom.js';

// The edit-mode switch lives in the hidden toolbar (see index.html) and
// gates Edit/Delete buttons plus the explicit-position override in the Add
// dialogs, since both can restructure or renumber the whole logbook.
// Reading the checkbox directly (rather than mirroring its state into a
// separate variable) means it's never possible for this to drift out of
// sync with what's actually on screen.
export function isEditModeEnabled() {
  return el('edit-mode-toggle').checked;
}
