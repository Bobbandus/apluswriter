import { describe, expect, it } from 'vitest';
import { fileSize, MCPB_URL, SETUP_URL } from './release';

describe('the permanent download links', () => {
  /* These two strings are what the site, the banner and the settings sheet all
     point at. The filenames are fixed by aplusdesktop/package.json's
     artifactName and by the upload step in the release workflow; if one of
     them is renamed, this is the test that notices. */
  it('point at the release assets the workflow uploads', () => {
    expect(SETUP_URL).toBe(
      'https://github.com/Bobbandus/apluswriter/releases/latest/download/A-Plus-Toolkit-Setup.exe',
    );
    expect(MCPB_URL).toBe('https://github.com/Bobbandus/apluswriter/releases/latest/download/aplus-toolkit.mcpb');
  });
});

describe('fileSize', () => {
  it('gives one decimal below a hundred megabytes', () => {
    expect(fileSize(52 * 1024 * 1024, 'en-GB')).toBe('52 MB');
    expect(fileSize(52.46 * 1024 * 1024, 'en-GB')).toBe('52.5 MB');
  });

  it('drops the decimal above a hundred', () => {
    expect(fileSize(107.4 * 1024 * 1024, 'en-GB')).toBe('107 MB');
  });

  it('says nothing rather than "0 MB" when the size is unknown', () => {
    expect(fileSize(0)).toBe('');
  });
});
