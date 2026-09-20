'use client';

import { useLiveBoard } from '@/lib/live/useLiveBoard';
import type { Position } from '@/lib/live/position';
import { DEFAULT_THEMES } from '@aplus/live/theme';
import { BoardView } from './BoardView';
import { Canvas } from './Canvas';

export interface OutputStageProps {
  token: string;
  position: Position;
  scale: number;
  /** Draw with one of the built-in themes instead of the board's own, to try a look on air without saving it. */
  themeIndex?: number | undefined;
  /** Show why nothing is drawn. Off on air, where an error message on the picture would be the worst outcome. */
  debug: boolean;
}

/**
 * The page OBS shows as a browser source. Transparent, and silent when something is wrong: an overlay that
 * cannot reach its board draws nothing rather than an error over the broadcast.
 */
export function OutputStage({ token, position, scale, themeIndex, debug }: OutputStageProps) {
  const { board, status } = useLiveBoard(token);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <Canvas>{board && <BoardView kind={board.kind} state={board.state} theme={(themeIndex !== undefined && DEFAULT_THEMES[themeIndex]) || board.theme} position={position} scale={scale} />}</Canvas>
      {debug && (
        <div style={{ position: 'fixed', left: 8, bottom: 8, font: '12px monospace', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '2px 6px' }}>
          {status}
          {board ? ` · v${board.version}` : ''}
        </div>
      )}
    </div>
  );
}
