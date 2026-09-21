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

/** A script the shell was asked to open, read off disk by the main process. */
export interface OpenedScript {
  /** The filename without its extension — the project's name unless the text says otherwise. */
  name: string;
  path: string;
  text: string;
}

export interface AppInfo {
  version: string;
  updateReady: boolean;
  /** The version waiting to be installed, when one is. */
  updateVersion: string;
}

/**
 * What `aplusdesktop/preload.cjs` puts on the page.
 *
 * Every call is optional: an older installed shell will not have the newest
 * ones, and the web build has none of them. Ask for one, check it is there,
 * and have an answer for when it is not.
 */
export interface DesktopApi {
  platform?: 'mac' | 'win' | 'linux';
  bridgeInfo?: () => Promise<{ port: number; token: string } | null>;
  saveFile?: (name: string, bytes: Uint8Array) => Promise<boolean>;
  setupClaude?: () => Promise<unknown>;
  mirrorFolder?: () => Promise<string | null>;
  mirrorChoose?: () => Promise<string | null>;
  mirrorClear?: () => Promise<null>;
  mirrorWrite?: (id: string, title: string, text: string) => Promise<unknown>;
  appInfo?: () => Promise<AppInfo>;
  restartToUpdate?: () => Promise<boolean>;
  onUpdateReady?: (fn: (info: { version: string }) => void) => () => void;
  takeOpenFiles?: () => Promise<OpenedScript[]>;
  onOpenFiles?: (fn: (files: OpenedScript[]) => void) => () => void;
}

/**
 * The shell's calls, or null in a browser.
 *
 * The house rule above says only this module tests for Electron. Four older
 * call sites still declare their own shape and cast; new code asks here.
 */
export function desktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null;
  return (window as { aplusDesktop?: DesktopApi }).aplusDesktop ?? null;
}
