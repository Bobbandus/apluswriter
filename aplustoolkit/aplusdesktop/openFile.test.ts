import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scriptArgs, readScript } = require('./openFile.cjs');

/** Every path in this test is pretend; nothing touches the disk. */
const anywhere = () => true;

describe('scriptArgs', () => {
  it('finds a script that was double-clicked', () => {
    expect(scriptArgs(['C:\\Program Files\\A+ Toolkit\\A+ Toolkit.exe', 'C:\\Manus\\Vilde.fountain'], anywhere)).toEqual([
      'C:\\Manus\\Vilde.fountain',
    ]);
  });

  it('never treats the executable itself as a file to open', () => {
    expect(scriptArgs(['C:\\x\\thing.fountain'], anywhere)).toEqual([]);
  });

  it('ignores switches, which is most of what argv holds', () => {
    const argv = ['app.exe', '--no-sandbox', '--inspect=9229', 'C:\\Manus\\Noa.fountain'];
    expect(scriptArgs(argv, anywhere)).toEqual(['C:\\Manus\\Noa.fountain']);
  });

  it('ignores the project folder passed in development', () => {
    expect(scriptArgs(['electron.exe', '.'], anywhere)).toEqual([]);
  });

  it('does not care about case in the extension', () => {
    expect(scriptArgs(['app.exe', 'C:\\Manus\\VILDE.FOUNTAIN'], anywhere)).toEqual(['C:\\Manus\\VILDE.FOUNTAIN']);
  });

  it('leaves other file types alone', () => {
    expect(scriptArgs(['app.exe', 'C:\\Manus\\script.fdx', 'C:\\Manus\\notes.txt'], anywhere)).toEqual([]);
  });

  it('skips a path that is not there', () => {
    const argv = ['app.exe', 'C:\\gone.fountain', 'C:\\here.fountain'];
    expect(scriptArgs(argv, (p: string) => p === 'C:\\here.fountain')).toEqual(['C:\\here.fountain']);
  });

  it('keeps several files in the order they were given', () => {
    const argv = ['app.exe', 'b.fountain', 'a.fountain'];
    expect(scriptArgs(argv, anywhere)).toEqual(['b.fountain', 'a.fountain']);
  });

  it('survives being handed nothing at all', () => {
    expect(scriptArgs(undefined, anywhere)).toEqual([]);
    expect(scriptArgs([], anywhere)).toEqual([]);
  });
});

describe('readScript', () => {
  it('names the project after the file', () => {
    const result = readScript('C:\\Manus\\Vilde och Noa.fountain', () => 'INT. MATSAL - DAG');
    expect(result).toEqual({
      name: 'Vilde och Noa',
      path: 'C:\\Manus\\Vilde och Noa.fountain',
      text: 'INT. MATSAL - DAG',
    });
  });

  it('returns null rather than throwing when the file cannot be read', () => {
    expect(
      readScript('C:\\locked.fountain', () => {
        throw new Error('EACCES');
      }),
    ).toBeNull();
  });
});
