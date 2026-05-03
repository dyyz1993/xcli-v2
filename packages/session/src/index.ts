export {
  daemonRequest,
  requireSession,
  getSession,
  saveSession,
  openSession,
  htmlSession,
  screenshotSession,
  SnapshotElement,
  snapshotSession,
  listSessions,
  closeSession,
  killDaemon,
  closeAllSessions,
  evalScriptSession,
  waitForSelector,
  waitForTimeout,
  navigateSession,
  refreshSession,
  gotoSession,
  pressSession,
  getElementSession,
  scrollSession,
  clickSession,
  selectSession,
  checkSession,
  typeSession,
  fillSession,
  mouseSession,
} from './session-client.js';

export {
  getCookies,
  setCookie,
  clearCookies,
  getLocalStorage,
  setLocalStorage,
  clearLocalStorage,
} from './storage-client.js';

export {
  ToolCallRecord,
  CommandArchiveEntry,
  OutlineEntry,
  SessionArchive,
  saveArchive,
  loadArchive,
  listArchives,
  searchArchives,
  diffArchives,
  appendCommandToArchive,
} from './session-archive.js';

export { createTrackedPage } from './page-proxy.js';
export type { PageProxyOptions } from './page-proxy.js';
