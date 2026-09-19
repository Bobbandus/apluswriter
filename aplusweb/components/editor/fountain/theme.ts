import { EditorView } from '@codemirror/view';

/**
 * Screenplay layout, as CodeMirror styles.
 *
 * Indents are expressed in real inches, relative to the left edge of the text
 * block (which the page itself has already inset by 1.5"). They are scaled by
 * `--zoom`, which `PageCanvas` sets — so the sheet on screen has the same
 * measure as the exported PDF at every zoom level.
 *
 * The numbers are the industry ones and come from `lib/paginator/geometry`:
 * character at 3.7" from the paper edge, dialogue at 2.5" and 3.5" wide,
 * parentheticals at 3.1" and 2" wide. Subtracting the 1.5" page margin gives
 * the offsets below.
 */
export const fountainTheme = EditorView.theme({
  '&': {
    fontFamily: 'var(--font-script)',
    fontSize: 'var(--script-size)',
    color: 'var(--page-ink)',
    backgroundColor: 'transparent',
    height: '100%',
  },

  '&.cm-focused': {
    outline: 'none',
  },

  '.cm-scroller': {
    fontFamily: 'var(--font-script)',
    lineHeight: 'var(--script-leading)',
    overflow: 'visible',
    // Courier is monospaced; anything that changes the advance width breaks
    // the character counts pagination is built on.
    fontVariantLigatures: 'none',
    fontKerning: 'none',
  },

  '.cm-content': {
    padding: 0,
    caretColor: 'var(--accent)',
    // Long action lines wrap at the measure, exactly like the page.
    whiteSpace: 'pre-wrap',
  },

  '.cm-line': {
    padding: 0,
  },

  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px',
  },

  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection-bg)',
  },

  /* ------------------------------------------------------------ elements */

  '.cm-el-sceneHeading': {
    marginTop: 'calc(0.1666in * var(--zoom, 1))',
    fontWeight: '700',
  },

  '.cm-el-action': {
    marginLeft: '0',
  },

  '.cm-el-character': {
    marginLeft: 'calc(2.2in * var(--zoom, 1))',
  },

  '.cm-el-parenthetical': {
    marginLeft: 'calc(1.6in * var(--zoom, 1))',
    maxWidth: 'calc(2in * var(--zoom, 1))',
  },

  '.cm-el-dialogue': {
    marginLeft: 'calc(1in * var(--zoom, 1))',
    maxWidth: 'calc(3.5in * var(--zoom, 1))',
  },

  '.cm-el-lyrics': {
    marginLeft: 'calc(1in * var(--zoom, 1))',
    maxWidth: 'calc(3.5in * var(--zoom, 1))',
    fontStyle: 'italic',
  },

  '.cm-el-transition': {
    textAlign: 'right',
  },

  '.cm-el-centered': {
    textAlign: 'center',
  },

  '.cm-el-pageBreak': {
    // Drawn as a rule rather than as three equals signs.
    color: 'transparent',
    borderTop: '1px dashed var(--page-ink-muted)',
    margin: 'calc(0.33in * var(--zoom, 1)) 0',
    height: '0',
    overflow: 'hidden',
  },

  /* Structure. These never print, so they are deliberately drawn as
     interface rather than as script — a writer should never mistake an
     outline note for something an actor will read. */
  '.cm-el-section': {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(var(--script-size) * 0.82)',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--accent-text)',
    marginTop: 'calc(0.33in * var(--zoom, 1))',
  },

  '.cm-el-synopsis': {
    fontFamily: 'var(--font-ui)',
    fontSize: 'calc(var(--script-size) * 0.86)',
    fontStyle: 'italic',
    color: 'var(--page-ink-muted)',
  },

  '.cm-el-note': {
    fontFamily: 'var(--font-ui)',
    fontSize: 'calc(var(--script-size) * 0.86)',
    color: 'var(--page-ink-muted)',
  },

  '.cm-el-boneyard': {
    opacity: '0.45',
    textDecoration: 'line-through',
  },

  /* ------------------------------------------------------- inline markup */

  '.cm-fx-bold': { fontWeight: '700' },
  '.cm-fx-italic': { fontStyle: 'italic' },
  '.cm-fx-boldItalic': { fontWeight: '700', fontStyle: 'italic' },
  '.cm-fx-underline': { textDecoration: 'underline' },

  '.cm-fx-note': {
    fontFamily: 'var(--font-ui)',
    fontSize: '0.82em',
    backgroundColor: 'var(--gold-soft)',
    color: 'var(--page-ink-muted)',
    borderRadius: '3px',
    padding: '0.1em 0.4em',
    boxShadow: 'inset 0 0 0 1px rgba(255, 206, 63, 0.4)',
  },

  '.cm-fx-tag': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.76em',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent-text)',
    borderRadius: '999px',
    padding: '0.1em 0.5em',
  },

  /* ------------------------------------------------------ element picker */

  '.cm-elementPicker': {
    minWidth: '190px',
    padding: '4px',
    borderRadius: 'var(--r-lg)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--line-strong)',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--t-body)',
    color: 'var(--text)',
  },

  '.cm-elementPicker-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 8px',
    borderRadius: 'var(--r-sm)',
  },

  '.cm-elementPicker-row:hover': {
    background: 'var(--bg-raised-hover)',
  },

  '.cm-elementPicker-key': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: 'var(--r-xs)',
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--t-micro)',
    color: 'var(--text-muted)',
  },

  '.cm-elementPicker-hint': {
    padding: '6px 8px 2px',
    borderTop: '1px solid var(--line-faint)',
    marginTop: '4px',
    fontSize: 'var(--t-micro)',
    color: 'var(--text-faint)',
  },

  '.cm-tooltip': {
    border: 'none',
    background: 'transparent',
  },

  /* ---------------------------------------------------------- autofinish */
  '.cm-autofinish': {
    minWidth: '220px',
    maxWidth: '320px',
    padding: '4px',
    borderRadius: 'var(--r-lg)',
    background: 'color-mix(in srgb, var(--bg-raised) 92%, transparent)',
    border: '1px solid var(--line-strong)',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(18px)',
    fontFamily: 'var(--font-ui)',
  },
  '.cm-autofinish-row': {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    padding: '6px 8px', border: '0', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--text)',
    font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  '.cm-autofinish-row[aria-selected="true"], .cm-autofinish-row:hover': { background: 'var(--accent-soft)' },
  '.cm-autofinish-row small': { color: 'var(--text-muted)', fontSize: 'var(--t-micro)' },
  '.cm-autofinish-ghost': { color: 'var(--page-ink-muted)', opacity: '0.55', pointerEvents: 'none' },
});
