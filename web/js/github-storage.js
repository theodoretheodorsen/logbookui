// Loads/saves logbook.db and logbook.csv straight from/to the logbook-data
// repo via the GitHub Contents API, so every save becomes a commit there.
// The token is a fine-grained PAT (Contents: read/write, scoped to just that
// one repo) the user creates themselves and pastes in - it lives only in
// this browser's localStorage, never in source.
import { GITHUB_OWNER, GITHUB_DATA_REPO } from './config.js';

const TOKEN_KEY = 'logbook.githubToken';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBytes(text) {
  return new TextEncoder().encode(text);
}

function contentsUrl(path) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_DATA_REPO}/contents/${path}`;
}

async function githubRequest(path, options) {
  const response = await fetch(contentsUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      ...options?.headers,
    },
  });
  return response;
}

// Returns `{ bytes, sha }` for the file at `path` in logbook-data, or throws
// with a message suitable for showError.
async function fetchFile(path) {
  const response = await githubRequest(path);
  if (!response.ok) {
    if (response.status === 404) throw new Error(`${path} not found in ${GITHUB_DATA_REPO}`);
    if (response.status === 401) throw new Error('GitHub token missing or invalid');
    throw new Error(`GitHub load failed (${response.status})`);
  }
  const body = await response.json();
  return { bytes: base64ToBytes(body.content), sha: body.sha };
}

// Writes `bytes` to `path` in logbook-data as a new commit with message
// `message`. Always fetches the current sha immediately before writing
// (rather than caching one across the session), so this works whether the
// file was just loaded from GitHub or is being created for the first time.
//
// If `expectedSha` is given, the fetched current sha must match it or the
// write is refused with a conflict error - this is what stops one device
// from silently clobbering a save made from another device (e.g. phone and
// laptop both editing the same logbook.db) since git has no way to merge a
// binary sqlite file. Pass the returned sha into the next call so repeated
// saves in the same session don't falsely conflict with themselves.
async function putFile(path, bytes, message, { expectedSha } = {}) {
  const existing = await githubRequest(path);
  let sha;
  if (existing.ok) {
    sha = (await existing.json()).sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub save failed while checking ${path} (${existing.status})`);
  }

  if (expectedSha != null && sha !== expectedSha) {
    const error = new Error(
      `${path} was changed on GitHub since it was loaded here. Reload the logbook before saving again, or you will overwrite those changes.`
    );
    error.conflict = true;
    throw error;
  }

  const response = await githubRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: bytesToBase64(bytes), ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub token missing or invalid');
    throw new Error(`GitHub save failed for ${path} (${response.status})`);
  }
  return (await response.json()).content.sha;
}

export { getToken, setToken, fetchFile, putFile, textToBytes };
