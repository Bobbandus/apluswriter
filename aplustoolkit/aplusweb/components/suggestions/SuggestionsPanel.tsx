'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel } from '@/components/ui/Panel';
import type { SuggestionCard } from '@aplus/bridge/protocol';
import type { BridgeStatus } from '@/lib/bridge/useBridge';
import { SimpleMarkdown } from './SimpleMarkdown';
import { SuggestionCardView } from './SuggestionCardView';
import styles from './SuggestionsPanel.module.css';

export interface SavedDocument {
  id: string;
  title: string;
  body: string;
  at: number;
}

export interface SuggestionsPanelProps {
  cards: SuggestionCard[];
  documents: SavedDocument[];
  status: BridgeStatus;
  onUse: (card: SuggestionCard, selected?: readonly number[]) => void;
  onDiscard: (card: SuggestionCard) => void;
  onUseAllFormat: () => void;
  onRemoveDocument: (id: string) => void;
}

export function SuggestionsPanel({
  cards,
  documents,
  status,
  onUse,
  onDiscard,
  onUseAllFormat,
  onRemoveDocument,
}: SuggestionsPanelProps) {
  const t = useTranslations('assistant');
  const formatCount = cards.filter((c) => c.suggestion.kind === 'format').length;

  return (
    <Panel title={t('title')}>
      <div className={styles.status} data-status={status}>
        <span className={styles.dot} aria-hidden="true" />
        {status === 'connected' ? t('connected') : status === 'connecting' ? t('connecting') : t('off')}
      </div>

      {formatCount >= 2 && (
        <div className={styles.bulk}>
          <Button variant="secondary" size="sm" onClick={onUseAllFormat}>
            {t('useAll', { count: formatCount })}
          </Button>
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState icon="sparkle" title={t('empty')} hint={status === 'off' ? t('offHint') : t('emptyHint')} />
      ) : (
        cards.map((card) => (
          <SuggestionCardView
            key={card.id}
            card={card}
            onUse={(selected) => onUse(card, selected)}
            onDiscard={() => onDiscard(card)}
          />
        ))
      )}

      {documents.length > 0 && (
        <section className={styles.saved}>
          <h3 className={styles.savedTitle}>{t('savedDocs')}</h3>
          {documents.map((doc) => (
            <details key={doc.id} className={styles.doc}>
              <summary>{doc.title}</summary>
              <SimpleMarkdown text={doc.body} />
              <Button variant="ghost" size="sm" icon="trash" onClick={() => onRemoveDocument(doc.id)}>
                {t('remove')}
              </Button>
            </details>
          ))}
        </section>
      )}
    </Panel>
  );
}
