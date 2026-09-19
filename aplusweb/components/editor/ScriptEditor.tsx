'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { fountainTheme } from './fountain/theme';
import { fountainDecorations } from './fountain/decorations';
import { elementFlow, switchElement } from './fountain/elementFlow';
import { elementPicker } from './fountain/picker';
import { fountainAutocomplete } from './fountain/autocomplete';
import {
  DEFAULT_EDITOR_SETTINGS,
  editorSettings,
  type EditorSettings,
} from './fountain/settings';
import type { SwitchableType } from '@aplus/fountain/rewrite';
import type { DictionaryData } from '@aplus/fountain/autocomplete';

export interface ScriptEditorProps {
  /** The Fountain source. Only read on mount — this is an uncontrolled editor. */
  initialValue: string;
  /** External structural edits (for example a dictionary rename). */
  value?: string;
  onChange: (value: string) => void;
  settings?: Partial<EditorSettings>;
  dictionary?: DictionaryData;
  /** Reports the caret offset, so the navigator can mark the current scene. */
  onCaretChange?: (offset: number) => void;
  autoFocus?: boolean;
}

/**
 * The writing surface.
 *
 * Uncontrolled on purpose. Round-tripping every keystroke through React state
 * would mean rebuilding CodeMirror's document on each one, which costs the
 * undo history and the selection — and on a feature-length script, the frame
 * budget too. CodeMirror owns the text; `onChange` reports it outward for
 * saving and indexing.
 */
export function ScriptEditor({
  initialValue,
  value,
  onChange,
  settings,
  dictionary,
  onCaretChange,
  autoFocus = true,
}: ScriptEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const settingsCompartment = useRef(new Compartment());
  const autocompleteCompartment = useRef(new Compartment());

  const locale = useLocale();
  const tElements = useTranslations('elements');
  const tEditor = useTranslations('editor');
  const tAutocomplete = useTranslations('autocomplete');

  /* Callbacks are read through refs so a parent re-render never tears down
     and rebuilds the editor, which would drop the caret and the undo stack. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCaretRef = useRef(onCaretChange);
  onCaretRef.current = onCaretChange;

  const resolved: EditorSettings = {
    ...DEFAULT_EDITOR_SETTINGS,
    locale: locale === 'en' ? 'en' : 'sv',
    ...settings,
  };

  useEffect(() => {
    if (!host.current || view.current) return;

    const labels: Partial<Record<SwitchableType, string>> = {
      sceneHeading: tElements('sceneHeading'),
      action: tElements('action'),
      character: tElements('character'),
      dialogue: tElements('dialogue'),
      parenthetical: tElements('parenthetical'),
      transition: tElements('transition'),
      note: tElements('note'),
      lyrics: tElements('lyrics'),
      section: tElements('section'),
      synopsis: tElements('synopsis'),
    };

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      rectangularSelection(),
      EditorView.lineWrapping,
      settingsCompartment.current.of(editorSettings.of(resolved)),
      autocompleteCompartment.current.of(
        fountainAutocomplete({
          dictionary: dictionary ?? { characters: [], locations: [], tags: [] },
          labels: {
            character: tAutocomplete('characters'),
            location: tAutocomplete('locations'),
            time: tAutocomplete('timesOfDay'),
            transition: tAutocomplete('transitions'),
            extension: tAutocomplete('extensions'),
            tag: tAutocomplete('tags'),
          },
        }),
      ),
      fountainTheme,
      fountainDecorations,
      elementPicker(labels, tEditor('elementPickerHint'), switchElement),
      elementFlow(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) {
          onCaretRef.current?.(update.state.selection.main.head);
        }
      }),
      EditorView.contentAttributes.of({
        // Character names and locations are whitelisted in M4; until then the
        // browser's own dictionary would underline every cue in the script.
        spellcheck: 'false',
        'aria-label': tEditor('placeholder'),
      }),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: initialValue, extensions }),
      parent: host.current,
    });

    view.current = instance;
    if (autoFocus) instance.focus();

    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mount once. Settings changes are handled by the reconfigure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Settings changes reconfigure the running editor. Rebuilding it instead
     would lose the caret, the selection and the whole undo history — and a
     writer who flips a preference should not be punished for it. */
  useEffect(() => {
    view.current?.dispatch({
      effects: settingsCompartment.current.reconfigure(editorSettings.of(resolved)),
    });
  }, [resolved.renderNotes, resolved.autoUppercase, resolved.autoContd, resolved.tabOnCharacter, resolved.locale]);

  useEffect(() => {
    view.current?.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        fountainAutocomplete({
          dictionary: dictionary ?? { characters: [], locations: [], tags: [] },
          labels: {
            character: tAutocomplete('characters'),
            location: tAutocomplete('locations'),
            time: tAutocomplete('timesOfDay'),
            transition: tAutocomplete('transitions'),
            extension: tAutocomplete('extensions'),
            tag: tAutocomplete('tags'),
          },
        }),
      ),
    });
  }, [dictionary, tAutocomplete]);

  // Most edits originate in CodeMirror and are already present. Structural
  // tools may edit the source outside the view; reflect only those edits.
  useEffect(() => {
    const instance = view.current;
    if (!instance || value === undefined || value === instance.state.doc.toString()) return;
    const head = Math.min(instance.state.selection.main.head, value.length);
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: value },
      selection: { anchor: head },
      userEvent: 'input.external',
    });
  }, [value]);

  return <div ref={host} data-testid="script-editor" />;
}
