import { Facet } from '@codemirror/state';
import { EMPTY_DICTIONARY, type DictionaryData } from '@aplus/fountain/autocomplete';

/**
 * The script's vocabulary and the UI strings that describe it, held in the
 * editor state.
 *
 * A leaf module on purpose. Autocomplete, the Enter auto-detect and the typo
 * guard all need the dictionary, and the element flow is imported by the
 * autocomplete. Putting the facet in any of those files would make an import
 * cycle, and under the bundler's CJS interop a cycle is a keystroke that
 * silently does nothing.
 */
export interface AutocompleteConfig {
  dictionary: DictionaryData;
  /** Per-kind labels for the popover, plus `typoFix` with a `{name}` slot. */
  labels: Record<string, string>;
}

const EMPTY_CONFIG: AutocompleteConfig = { dictionary: EMPTY_DICTIONARY, labels: {} };

export const autocompleteConfig = Facet.define<AutocompleteConfig, AutocompleteConfig>({
  combine: (values) => values[0] ?? EMPTY_CONFIG,
});
