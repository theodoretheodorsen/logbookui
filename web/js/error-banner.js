import { el } from './dom.js';

const errorBox = el('error-box');

let hideTimer;

export function showError(message) {
  clearTimeout(hideTimer);
  errorBox.textContent = message;
  errorBox.className = 'error';
  errorBox.hidden = false;
}

// Same banner spot as showError, styled green and auto-dismissed - for
// one-off confirmations (e.g. "Saved to GitHub") rather than problems that
// should stay visible until the user's next action.
export function showSuccess(message, autoHideMs = 3000) {
  clearTimeout(hideTimer);
  errorBox.textContent = message;
  errorBox.className = 'success';
  errorBox.hidden = false;
  hideTimer = setTimeout(clearError, autoHideMs);
}

export function clearError() {
  clearTimeout(hideTimer);
  errorBox.hidden = true;
  errorBox.textContent = '';
}
