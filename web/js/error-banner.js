import { el } from './dom.js';

const errorBox = el('error-box');

export function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

export function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}
