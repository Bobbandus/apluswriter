'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { fountainTheme } from './fountain/theme';
import { fountainDecorations } from './fountain/decorations';
import { DEFAULT_FLOW, elementFlow, switchElement, type FlowSettings } from './fountain/elementFlow';
import { elementPicker } from './fountain/picker';
import type { SwitchableType } from '@/lib/fountain/rewrite';

export interface ScriptEditorProps {
  /** The Fountain source. Only read on mount — this is an uncontrolled editor. */
  initialValue: string;
  onChange: (value: string) => void;
  settings?: Partial<FlowSettings>;
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
  onChange,
  settings,
  autoFocus = true,
}: ScriptEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  const locale = useLocale();
  const tElements = useTranslations('elements');
  const tEditor = useTranslations('editor');

  /* Handlers are read through refs so changing a setting never tears down and
     rebuilds the editor — which would drop the caret and the undo stack. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const settingsRef = useRef<FlowSettings>({
    ...DEFAULT_FLOW,
    locale: locale === 'en' ? 'en' : 'sv',
    ...settings,
  });
  settingsRef.current = {
    ...DEFAULT_FLOW,
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
      fountainTheme,
      fountainDecorations,
      elementPicker(labels, tEditor('elementPickerHint'), switchElement),
      elementFlow(() => settingsRef.current),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
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
    // Mount once. Locale changes are picked up through settingsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} data-testid="script-editor" />;
}
