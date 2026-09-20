import { Facet } from '@codemirror/state';

/**
 * Editor settings, held in the editor's own state.
 *
 * A facet rather than a closure over React state: every command already
 * receives an `EditorState`, so reading settings from it means nothing has to
 * be threaded through, and changing a setting reconfigures the editor instead
 * of rebuilding it — which would drop the caret and the undo history.
 */
export interface EditorSettings {
  /**
   * Draw `[[notes]]` as pills with the brackets hidden.
   *
   * Off shows the raw Fountain. Some writers want to see exactly what is in
   * the file, and pretty rendering of something you are about to hand to
   * another app is a liability, not a feature.
   */
  renderNotes: boolean;

  /** Uppercase scene headings and cues as they are typed. */
  autoUppercase: boolean;

  /** Insert `(CONT'D)` / `(FORTS.)` when a character resumes after action. */
  autoContd: boolean;

  /** What Tab does on a cue line. */
  tabOnCharacter: 'parenthetical' | 'extension';

  /** Decides between `(CONT'D)` and `(FORTS.)`. */
  locale: 'sv' | 'en';

  /**
   * The browser's or the app's own spell checker, on dialogue and action only.
   * Off by default: a script is full of names and abbreviations, and red
   * underlines nobody asked for are noise.
   */
  spellcheck: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  renderNotes: true,
  autoUppercase: true,
  autoContd: true,
  tabOnCharacter: 'parenthetical',
  locale: 'sv',
  spellcheck: false,
};

export const editorSettings = Facet.define<EditorSettings, EditorSettings>({
  combine: (values) => values[0] ?? DEFAULT_EDITOR_SETTINGS,
});

/** Convenience for commands, which always have a state to hand. */
export function settingsOf(state: { facet: (f: typeof editorSettings) => EditorSettings }): EditorSettings {
  return state.facet(editorSettings);
}
