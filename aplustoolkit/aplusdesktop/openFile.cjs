'use strict';

/**
 * Opening a .fountain file from outside the app.
 *
 * Double-clicking a script in Explorer, or dragging one onto the icon, starts
 * the app with the path on the command line — or, if it is already running,
 * hands the path to the first instance through `second-instance`. macOS uses
 * `open-file` instead. All three end up here.
 *
 * The argument list is not a tidy place: Electron's own switches are in there,
 * so is the path to the executable, and in development so is the project
 * folder. So the rule is narrow on purpose — a real file, ending in .fountain,
 * that is not a flag. Anything else is ignored rather than guessed at.
 */

const fs = require('node:fs');
const path = require('node:path');

/** A file we are willing to open. Kept small so it cannot be talked into more. */
const EXTENSIONS = new Set(['.fountain', '.spmd']);

/**
 * The script paths in one argv, in the order they were given.
 *
 * `exists` is injected so the rule itself can be tested without touching the
 * disk; it defaults to the real check.
 */
function scriptArgs(argv, exists = (p) => fs.existsSync(p)) {
  if (!Array.isArray(argv)) return [];
  return argv
    .slice(1) // argv[0] is the executable
    .filter((arg) => typeof arg === 'string')
    .filter((arg) => !arg.startsWith('-')) // --inspect, --no-sandbox, …
    .filter((arg) => EXTENSIONS.has(path.extname(arg).toLowerCase()))
    .filter((arg) => exists(arg));
}

/**
 * A script read off disk, or null when it cannot be read.
 *
 * The title falls back to the filename, which is what a writer expects: a file
 * called `Vilde.fountain` becomes a project called Vilde, unless the text
 * carries its own title page.
 */
function readScript(file, read = (p) => fs.readFileSync(p, 'utf8')) {
  try {
    const text = read(file);
    return { name: path.basename(file, path.extname(file)), path: file, text };
  } catch {
    return null;
  }
}

module.exports = { scriptArgs, readScript, EXTENSIONS };
