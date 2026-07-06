// The pilot's home base - used to prefill a plausible departure/destination
// when adding a new flight (see dialogs/flight-dialog.js).
export const HOME_BASE = 'LEMD';

// Where the logbook data (logbook.db / logbook.csv) lives - see
// github-storage.js. The token itself is never stored here or anywhere in
// source; it's entered by the user and kept in their browser's localStorage.
export const GITHUB_OWNER = 'theodoretheodorsen';
export const GITHUB_DATA_REPO = 'logbook-data';
