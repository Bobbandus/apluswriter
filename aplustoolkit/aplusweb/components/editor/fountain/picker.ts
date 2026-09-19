import { Prec, StateEffect, StateField, type StateCommand } from '@codemirror/state';
import { keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { PICKER_KEYS, type SwitchableType } from '@aplus/fountain/rewrite';

/**
 * The element picker.
 *
 * Pressing Enter on an already-empty line opens it. That moment is the only
 * time the writer is plainly told what their options are — every other way
 * into an element type is a shortcut you have to already know. So the picker
 * doubles as the app's documentation, which is why each row shows its letter.
 *
 * It is a CodeMirror tooltip rather than a React overlay so that it follows
 * the caret through scrolling and reflow for free.
 */

export const openPicker = StateEffect.define<number>();
export const closePicker = StateEffect.define<null>();

export type PickerLabels = Partial<Record<SwitchableType, string>>;

/** The rows, in the order they are shown. */
const ROWS: { key: string; type: SwitchableType }[] = Object.entries(PICKER_KEYS).map(
  ([key, type]) => ({ key, type }),
);

function buildTooltip(pos: number, labels: PickerLabels, hint: string): Tooltip {
  return {
    pos,
    above: false,
    strictSide: false,
    arrow: false,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-elementPicker';
      dom.setAttribute('role', 'listbox');

      for (const row of ROWS) {
        const item = document.createElement('div');
        item.className = 'cm-elementPicker-row';
        item.setAttribute('role', 'option');

        const key = document.createElement('kbd');
        key.className = 'cm-elementPicker-key';
        key.textContent = row.key.toUpperCase();

        const label = document.createElement('span');
        label.textContent = labels[row.type] ?? row.type;

        item.append(key, label);
        dom.append(item);
      }

      const footer = document.createElement('div');
      footer.className = 'cm-elementPicker-hint';
      footer.textContent = hint;
      dom.append(footer);

      return { dom };
    },
  };
}

/**
 * `choose` is injected rather than imported.
 *
 * The picker needs to switch the current element, and the element flow needs
 * to open the picker. Importing both ways would make a module cycle, and a
 * cycle here is not a style problem — under the bundler's CJS interop one side
 * evaluates to `undefined`, and the failure shows up as a keystroke silently
 * doing nothing.
 */
export function elementPicker(
  labels: PickerLabels,
  hint: string,
  choose: (type: SwitchableType) => StateCommand,
) {
  const field = StateField.define<Tooltip | null>({
    create: () => null,

    update(value, transaction) {
      for (const effect of transaction.effects) {
        if (effect.is(openPicker)) return buildTooltip(effect.value, labels, hint);
        if (effect.is(closePicker)) return null;
      }

      // Any edit or caret move dismisses it — the picker is modal only for
      // the single keystroke that follows opening it.
      if (value && (transaction.docChanged || transaction.selection)) return null;

      return value;
    },

    provide: (f) => showTooltip.from(f),
  });

  /* The picker has to outrank the ordinary keymap, or `s` would type an `s`
     instead of choosing a scene heading. */
  const keys = Prec.highest(
    keymap.of([
      {
        any: (view, event) => {
          if (!view.state.field(field, false)) return false;

          if (event.key === 'Escape') {
            view.dispatch({ effects: closePicker.of(null) });
            return true;
          }

          const chosen = PICKER_KEYS[event.key.toLowerCase()];
          if (!chosen) return false;

          view.dispatch({ effects: closePicker.of(null) });
          choose(chosen)(view);
          return true;
        },
      },
    ]),
  );

  return [field, keys];
}
