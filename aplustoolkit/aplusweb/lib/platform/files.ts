'use client';

import { isDesktop } from './index';

/**
 * Saving a file the writer asked for.
 *
 * On the web this is a download. In the desktop app it goes through the
 * native save dialog, which the Electron preload exposes as
 * `window.aplusDesktop.saveFile`. Feature code calls this and never needs to
 * know which one it got — that is the point of the platform layer.
 */

interface DesktopBridge {
  saveFile?: (name: string, bytes: Uint8Array) => Promise<boolean>;
}

export async function saveFile(name: string, blob: Blob): Promise<void> {
  const desktop = (window as unknown as { aplusDesktop?: DesktopBridge }).aplusDesktop;
  if (isDesktop() && desktop?.saveFile) {
    await desktop.saveFile(name, new Uint8Array(await blob.arrayBuffer()));
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL goes.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
