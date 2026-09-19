'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { DiffView } from '@/components/ui/DiffView';
import { Icon } from '@/components/icons/Icon';
import type { Suggestion, SuggestionCard } from '@aplus/bridge/protocol';
import { SimpleMarkdown } from './SimpleMarkdown';
import styles from './SuggestionCardView.module.css';

export interface SuggestionCardViewProps {
  card: SuggestionCard;
  onUse: () => void;
  onDiscard: () => void;
}

/** Kinds that end up in the script text; the rest are saved beside it. */
const EDITS_SCRIPT = new Set<Suggestion['kind']>(['synopsis', 'tags', 'metadata', 'note', 'format']);

/**
 * One suggestion, with the two choices the writer always has.
 *
 * Every card says what *would* happen and does nothing until Use is clicked.
 * A format fix shows the exact diff, so "use" is never a leap of faith.
 */
export function SuggestionCardView({ card, onUse, onDiscard }: SuggestionCardViewProps) {
  const t = useTranslations('assistant');
  const s = card.suggestion;

  return (
    <article className={styles.card} aria-label={card.label}>
      <header className={styles.header}>
        <Icon name="sparkle" size={14} />
        <h3 className={styles.title}>{card.label}</h3>
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
        <Button variant="primary" size="sm" onClick={onUse}>
          {EDITS_SCRIPT.has(s.kind) ? t('use') : t('save')}
        </Button>
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
