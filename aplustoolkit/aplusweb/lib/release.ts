/**
 * What has actually been published.
 *
 * The download links used to be a string copied into two components, pointing
 * at a file that — for the whole of v0.1.0 — was never there: the release
 * workflow failed before it uploaded anything, and the page went on offering
 * the download anyway. So the page asks GitHub what exists instead of
 * asserting it, and says so plainly when the answer is nothing.
 */

const REPO = 'Bobbandus/apluswriter';

/**
 * The installer is published under a name with no version in it, so these two
 * links are correct forever. See `aplusdesktop/package.json` → `artifactName`
 * and `.github/workflows/release.yml`.
 */
export const SETUP_URL = `https://github.com/${REPO}/releases/latest/download/A-Plus-Toolkit-Setup.exe`;
export const MCPB_URL = `https://github.com/${REPO}/releases/latest/download/aplus-toolkit.mcpb`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  url: string;
  /** Bytes, as GitHub reports them. */
  size: number;
}

export interface Release {
  /** The tag, e.g. `v0.2.0`. */
  tag: string;
  /** ISO date, or null for a release that was never published. */
  published: string | null;
  /** The release notes, as Markdown. */
  notes: string;
  setup: ReleaseAsset | null;
  extension: ReleaseAsset | null;
  /** True when the updater's metadata is on the release too. */
  updatable: boolean;
}

interface GitHubAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
}

function asset(assets: GitHubAsset[], name: string): ReleaseAsset | null {
  const found = assets.find((a) => a.name === name);
  if (!found || typeof found.browser_download_url !== 'string') return null;
  return {
    name,
    url: found.browser_download_url,
    size: typeof found.size === 'number' ? found.size : 0,
  };
}

/**
 * The latest published release, or null.
 *
 * Null covers every way this can go wrong — no release yet, GitHub down, rate
 * limited — because the page treats them the same: it stops promising a file.
 * Cached for an hour; a release is not news that has to arrive in seconds.
 */
export async function getLatestRelease(): Promise<Release | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      tag_name?: unknown;
      published_at?: unknown;
      body?: unknown;
      draft?: unknown;
      assets?: unknown;
    };
    // A draft is invisible to the download link and to the updater, so as far
    // as this page is concerned it does not exist.
    if (data.draft === true) return null;

    const assets = Array.isArray(data.assets) ? (data.assets as GitHubAsset[]) : [];
    return {
      tag: typeof data.tag_name === 'string' ? data.tag_name : '',
      published: typeof data.published_at === 'string' ? data.published_at : null,
      notes: typeof data.body === 'string' ? data.body : '',
      setup: asset(assets, 'A-Plus-Toolkit-Setup.exe'),
      extension: asset(assets, 'aplus-toolkit.mcpb'),
      updatable: assets.some((a) => a.name === 'latest.yml'),
    };
  } catch {
    return null;
  }
}

/** `107 MB`. One decimal below 100, none above — nobody needs 107.4. */
export function fileSize(bytes: number, locale = 'sv-SE'): string {
  const mb = bytes / (1024 * 1024);
  if (mb <= 0) return '';
  const rounded = mb < 100 ? Math.round(mb * 10) / 10 : Math.round(mb);
  return `${rounded.toLocaleString(locale)} MB`;
}
