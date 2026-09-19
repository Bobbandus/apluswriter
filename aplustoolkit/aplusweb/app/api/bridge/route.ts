import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import type { BridgeFile } from '@aplus/bridge/protocol';

/**
 * Pairing for the web app running on this computer.
 *
 * A web page cannot read `~/.aplus-write/bridge.json`, so the local dev server
 * does it and hands the port and token to the page. Three guards, because
 * this hands out a credential:
 *
 * - it only exists off Vercel (a hosted server has no bridge to read);
 * - it only answers requests addressed to localhost;
 * - browsers will not let another site read the response (same origin).
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const host = new URL(request.url).hostname;
  if (process.env['VERCEL'] || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    return NextResponse.json({ error: 'not available' }, { status: 404 });
  }

  const dir = process.env['APLUS_BRIDGE_DIR'] ?? join(homedir(), '.aplus-write');
  try {
    const file = JSON.parse(readFileSync(join(dir, 'bridge.json'), 'utf8')) as BridgeFile;
    const alive = file.servers.filter((s) => {
      try {
        process.kill(s.pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    });
    const newest = alive.sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!newest) return NextResponse.json({ error: 'no server' }, { status: 404 });
    return NextResponse.json({ port: newest.port, token: newest.token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'no server' }, { status: 404 });
  }
}
