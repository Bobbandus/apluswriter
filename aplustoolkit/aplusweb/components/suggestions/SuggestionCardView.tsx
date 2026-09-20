'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { DiffView } from '@/components/ui/DiffView';
import { Icon } from '@/components/icons/Icon';
import type { Suggestion, SuggestionCard } from '@aplus/bridge/protocol';
import { SimpleMarkdown } from './SimpleMarkdown';
import styles from './SuggestionCardView.module.css';

export interface SuggestionCardViewProps {
  card: SuggestionCard;
  /** Which parts of a multi-part suggestion to apply, by index. */
  onUse: (selected?: readonly number[]) => void;
  onDiscard: () => void;
}

/** Kinds that end up in the script text; the rest are saved beside it. */
const EDITS_SCRIPT = new Set<Suggestion['kind']>([
  'synopsis',
  'tags',
  'metadata',
  'note',
  'format',
  'rewrite',
  'alternatives',
  'insert',
]);

/**
 * One suggestion, with the two choices the writer always has.
 *
 * Every card says what *would* happen and does nothing until Use is clicked.
 * A format fix or a rewrite shows the exact diff, so "use" is never a leap of
 * faith — and a rewrite with several changes is ticked apart, because "make
 * the scene more emotional" is a dozen decisions and eleven of them being
 * right should not cost the writer the whole card.
 */
export function SuggestionCardView({ card, onUse, onDiscard }: SuggestionCardViewProps) {
  const t = useTranslations('assistant');
  const s = card.suggestion;

  /* Everything starts ticked: the common case is taking the lot, and a card
     that arrives with nothing selected reads as an argument to be won. */
  const [dropped, setDropped] = useState<ReadonlySet<number>>(() => new Set<number>());
  const toggle = (index: number) =>
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const chosen = s.kind === 'rewrite' ? s.hunks.map((_, index) => index).filter((index) => !dropped.has(index)) : [];

  return (
    <article className={styles.card} aria-label={card.label}>
      <header className={styles.header}>
        <Icon name="sparkle" size={14} />
        <h3 className={styles.title}>{card.label}</h3>
        {s.kind === 'rewrite' && s.hunks.length > 1 && (
          <span className={styles.count}>{t('changes', { count: s.hunks.length })}</span>
        )}
      </header>

      <div className={styles.body}>
        {s.kind === 'shotlist' && (
          <>
            {s.shotlist.approach && <p className={styles.lead}>{s.shotlist.approach}</p>}
            <ol className={styles.shots}>
              {s.shotlist.shots.map((shot) => (
                <li key={shot.number} className={styles.shot}>
                  <span className={styles.shotNumber}>{shot.number}</span>
                  <span className={styles.shotBody}>
                    <span className={styles.shotSpecs}>
                      {[shot.size, shot.lens ? `${shot.lens} mm` : null, shot.angle, shot.movement].filter(Boolean).join(' · ')}
                    </span>
                    {shot.description}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {s.kind === 'tags' && (
          <ul className={styles.pills}>
            {s.tags.map((tag) => (
              <li key={`${tag.kind}:${tag.value}`} className={styles.pill}>
                <b>{tag.kind}</b> {tag.value}
              </li>
            ))}
          </ul>
        )}

        {s.kind === 'synopsis' && <p className={styles.text}>{s.text}</p>}

        {s.kind === 'metadata' && (
          <ul className={styles.pills}>
            {s.color && <li className={styles.pill}><b>color</b> {s.color}</li>}
            {s.status && <li className={styles.pill}><b>status</b> {s.status}</li>}
            {s.beat && <li className={styles.pill}><b>beat</b> {s.beat}</li>}
            {s.cast?.map((name) => <li key={name} className={styles.pill}><b>cast</b> {name}</li>)}
          </ul>
        )}

        {s.kind === 'note' && (
          <p className={styles.text}>
            {s.todo && <b className={styles.badge}>{t('todo')}</b>} {s.text}
          </p>
        )}

        {s.kind === 'format' && (
          <>
            <p className={styles.text}>{s.explanation}</p>
            <DiffView before={s.before} after={s.after} context={1} />
          </>
        )}

        {s.kind === 'rewrite' && (
          <>
            {s.explanation && <p className={styles.lead}>{s.explanation}</p>}
            {s.hunks.length === 1 ? (
              <DiffView before={s.hunks[0]?.before ?? ''} after={s.hunks[0]?.after ?? ''} context={1} />
            ) : (
              <ul className={styles.parts}>
                {s.hunks.map((hunk, index) => (
                  <li key={index} className={styles.part} data-dropped={dropped.has(index) || undefined}>
                    <label className={styles.check}>
                      <input type="checkbox" checked={!dropped.has(index)} onChange={() => toggle(index)} />
                      <span>{hunk.note ?? t('changeNumber', { number: index + 1 })}</span>
                    </label>
                    <DiffView before={hunk.before} after={hunk.after} context={1} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {s.kind === 'alternatives' && (
          <>
            {s.explanation && <p className={styles.lead}>{s.explanation}</p>}
            <ul className={styles.parts}>
              {s.options.map((option, index) => (
                <li key={index} className={styles.part}>
                  <div className={styles.optionHead}>
                    <span className={styles.optionLabel}>{option.label ?? String(index + 1)}</span>
                    <Button size="sm" variant="secondary" onClick={() => onUse([index])}>
                      {t('chooseThis')}
                    </Button>
                  </div>
                  <DiffView before={s.before} after={option.after} context={1} />
                </li>
              ))}
            </ul>
          </>
        )}

        {s.kind === 'insert' && (
          <>
            {s.explanation && <p className={styles.lead}>{s.explanation}</p>}
            <p className={styles.where}>
              {t('insertAfter', {
                where: 'afterScene' in s.anchor ? s.anchor.afterScene.heading : s.anchor.after.trim().split('\n').pop() ?? '',
              })}
            </p>
            {/* Nothing is removed, so a red-and-green diff would be theatre:
                every line here is new. */}
            <pre className={styles.newText}>{s.text.trim()}</pre>
          </>
        )}

        {s.kind === 'character' && (
          <dl className={styles.facts}>
            {s.profile.summary && <p className={styles.text}>{s.profile.summary}</p>}
            {s.profile.age && <Fact label="Age" value={s.profile.age} />}
            {s.profile.traits?.length ? <Fact label="Traits" value={s.profile.traits.join(', ')} /> : null}
            {s.profile.wants && <Fact label={t('wants')} value={s.profile.wants} />}
            {s.profile.needs && <Fact label={t('needs')} value={s.profile.needs} />}
            {s.profile.arc && <Fact label={t('arc')} value={s.profile.arc} />}
            {s.profile.relationships?.map((r) => <Fact key={r.name} label={r.name} value={r.relation} />)}
            {s.profile.evidence?.length ? <Fact label={t('evidence')} value={s.profile.evidence.join(' — ')} /> : null}
          </dl>
        )}

        {s.kind === 'document' && <SimpleMarkdown text={s.body} />}
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          {t('discard')}
        </Button>
        {/* Alternatives are chosen one by one above; a second Use here would
            only raise the question of which one it meant. */}
        {s.kind !== 'alternatives' && (
          <Button
            variant="primary"
            size="sm"
            disabled={s.kind === 'rewrite' && chosen.length === 0}
            onClick={() => onUse(s.kind === 'rewrite' ? chosen : undefined)}
          >
            {EDITS_SCRIPT.has(s.kind) ? t('use') : t('save')}
          </Button>
        )}
      </footer>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
