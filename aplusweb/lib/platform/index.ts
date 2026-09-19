/**
 * The platform seam.
 *
 * Everything the web build and a future Electron build would do differently
 * goes behind this module: window chrome, file dialogs, native menus. Feature
 * code asks the platform rather than sniffing for `window.electron` itself,
 * so adding the desktop build is a matter of implementing this surface.
 */

export { detectPlatform, formatShortcut, hasMod, type Platform } from './keys';

export interface PlatformCapabilities {
  /** The app draws its own window chrome and the traffic lights are real. */
  nativeWindowControls: boolean;
  /** Real open/save dialogs against the file system are available. */
  fileSystem: boolean;
  /** A native application menu bar exists. */
  nativeMenu: boolean;
}

/**
 * True when running inside the Electron shell.
 *
 * The desktop build sets `window.__APLUS_DESKTOP__` in its preload script.
 * Nothing else in the app is allowed to test for Electron directly.
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as { __APLUS_DESKTOP__?: boolean }).__APLUS_DESKTOP__);
}

export function capabilities(): PlatformCapabilities {
  const desktop = isDesktop();
  return {
    nativeWindowControls: desktop,
    fileSystem: desktop,
    nativeMenu: desktop,
  };
}
