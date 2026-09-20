'use client';

import { useCallback, type RefObject } from 'react';
import { applyEdits, diffToEdit, editsFor, resolveScene } from '@aplus/bridge/apply';
import type { Shotlist, SuggestionCard } from '@aplus/bridge/protocol';
import { parse } from '@aplus/fountain/parse';
import type { ScriptEditorHandle } from '@/components/editor/ScriptEditor';
import type { SavedDocument } from '@/components/suggestions/SuggestionsPanel';
import { useProjectData } from '@/lib/storage/hooks';
import type { UseBridge } from './useBridge';

/**
 * What happens when the writer clicks Use or Discard on a suggestion.
 *
 * Text-shaped suggestions become edits applied through the editor, so they are
 * ordinary undoable transactions: Ctrl+Z takes any of them back. Everything
 * else (shotlists, saved texts, profiles) is production data stored beside the
 * script. Every suggestion is re-resolved against the *current* text at the
 * moment of Use, because the writer kept typing while Claude thought.
 */

export interface CharacterProfileRecord {
  name: string;
  profile: Record<string, unknown>;
  at: number;
}

export interface UseAssistant {
  shotlists: Shotlist[];
  documents: SavedDocument[];
  profiles: CharacterProfileRecord[];
  /** `selected` names the parts of a multi-part suggestion the writer kept. */
  use: (card: SuggestionCard, selected?: readonly number[]) => void;
  discard: (card: SuggestionCard) => void;
  useAllFormat: () => void;
  removeDocument: (id: string) => void;
  removeShotlist: (shotlist: Shotlist) => void;
  /** The saved shotlist for a scene, if any. */
  shotlistFor: (heading: string, index: number) => Shotlist | null;
}

const normalise = (heading: string) => heading.replace(/\s+/g, ' ').trim().toUpperCase();

export function useAssistant(
  projectId: string,
  editor: RefObject<ScriptEditorHandle | null>,
  bridge: UseBridge,
  say: (message: string) => void,
  messages: Record<'applied' | 'partlyStale' | 'stale' | 'sceneGone' | 'notFormatting' | 'saved', string>,
): UseAssistant {
  const [shotlists, setShotlists] = useProjectData<Shotlist[]>(projectId, 'shotlists', []);
  const [documents, setDocuments] = useProjectData<SavedDocument[]>(projectId, 'documents', []);
  const [profiles, setProfiles] = useProjectData<CharacterProfileRecord[]>(projectId, 'characterProfiles', []);

  const apply = useCallback(
    (card: SuggestionCard, selected?: readonly number[]): { ok: false } | { ok: true; partial: boolean } => {
      const handle = editor.current;
      if (!handle) return { ok: false };
      // Resolved against the live document, not the text the suggestion was
      // made for: the writer kept typing while Claude was thinking.
      const result = editsFor(handle.getText(), card.suggestion, selected);
      if (!result.ok) {
        say(result.reason === 'stale' ? messages.stale : result.reason === 'sceneNotFound' ? messages.sceneGone : messages.notFormatting);
        return { ok: false };
      }
      // Every change in one transaction, so one undo takes back the lot.
      handle.applyChanges(result.edits);
      return { ok: true, partial: (result.stale?.length ?? 0) > 0 };
    },
    [editor, say, messages],
  );

  const use = useCallback(
    (card: SuggestionCard, selected?: readonly number[]) => {
      const s = card.suggestion;

      if (s.kind === 'shotlist') {
        const key = normalise(s.shotlist.scene.heading);
        setShotlists((current) => [
          ...current.filter((existing) => normalise(existing.scene.heading) !== key || existing.scene.index !== s.shotlist.scene.index),
          s.shotlist,
        ]);
        say(messages.saved);
      } else if (s.kind === 'document') {
        setDocuments((current) => [{ id: card.id, title: s.title, body: s.body, at: Date.now() }, ...current]);
        say(messages.saved);
      } else if (s.kind === 'character') {
        setProfiles((current) => [
          { name: s.name, profile: s.profile as Record<string, unknown>, at: Date.now() },
          ...current.filter((p) => p.name !== s.name),
        ]);
        say(messages.saved);
      } else {
        const outcome = apply(card, selected);
        if (!outcome.ok) return; // Leave the card in place so the writer can see why.
        say(outcome.partial ? messages.partlyStale : messages.applied);
      }

      bridge.decide(card.id, true);
    },
    [apply, bridge, say, messages, setDocuments, setProfiles, setShotlists],
  );

  const discard = useCallback((card: SuggestionCard) => bridge.decide(card.id, false), [bridge]);

  const useAllFormat = useCallback(() => {
    const handle = editor.current;
    if (!handle) return;

    // Resolved one after another against the text as the previous fix left
    // it, but applied as ONE edit: a single Ctrl+Z takes back the whole batch.
    const original = handle.getText();
    let text = original;
    const done: SuggestionCard[] = [];
    for (const card of bridge.cards.filter((c) => c.suggestion.kind === 'format')) {
      const result = editsFor(text, card.suggestion, undefined);
      if (!result.ok) continue;
      text = applyEdits(text, result.edits);
      done.push(card);
    }

    if (done.length === 0) {
      say(messages.stale);
      return;
    }
    handle.applyChanges(diffToEdit(original, text));
    for (const card of done) bridge.decide(card.id, true);
    say(messages.applied);
  }, [editor, bridge, say, messages]);

  const shotlistFor = useCallback(
    (heading: string, index: number): Shotlist | null => {
      const wanted = normalise(heading);
      let best: Shotlist | null = null;
      let distance = Number.POSITIVE_INFINITY;
      for (const list of shotlists) {
        if (normalise(list.scene.heading) !== wanted) continue;
        const d = Math.abs(list.scene.index - index);
        if (d < distance) {
          best = list;
          distance = d;
        }
      }
      return best;
    },
    [shotlists],
  );

  return {
    shotlists,
    documents,
    profiles,
    use,
    discard,
    useAllFormat,
    removeDocument: (id) => setDocuments((current) => current.filter((d) => d.id !== id)),
    removeShotlist: (target) => setShotlists((current) => current.filter((l) => l !== target)),
    shotlistFor,
  };
}

/** Finds where a scene reference points in a piece of text, for `focusScene`. */
export function sceneOffset(source: string, ref: { index: number; heading: string }): number | null {
  const scene = resolveScene(parse(source), ref);
  return scene ? scene.from : null;
}
