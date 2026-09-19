import type { ReactElement } from 'react';

/**
 * The A+ Write icon set.
 *
 * Every glyph is drawn on a 20×20 grid with a 1.5px stroke, round caps and
 * round joins, and no fills. Nothing here comes from an icon package.
 *
 * The `el*` glyphs are deliberately literal: each one draws the element's
 * actual geometry on the page — where the text sits, how wide it runs. So the
 * element picker doubles as a reminder of screenplay layout.
 */
const paths = {
  /* ---------------------------------------------------------------- panels */

  /** Pencil. The writing view. */
  write: (
    <>
      <path d="M13.2 3.6a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4l-8.6 8.6-4 1.2 1.2-4z" />
      <path d="M12.1 4.7l3.2 3.2" />
    </>
  ),

  /** A card with another peeking behind it. The index card board. */
  cards: (
    <>
      <path d="M6.5 3.5h8.4a1.6 1.6 0 0 1 1.6 1.6v8.4" />
      <rect x="3.5" y="6.5" width="11" height="10" rx="1.6" />
      <path d="M6.3 9.8h5.4" />
    </>
  ),

  /** Two figures. */
  characters: (
    <>
      <circle cx="8" cy="7.3" r="2.9" />
      <path d="M2.8 16.8c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2" />
      <path d="M13.9 5.1a2.9 2.9 0 0 1 0 4.4" />
      <path d="M15 12c1.8.7 3 2.5 3 4.8" />
    </>
  ),

  /** Map pin. */
  locations: (
    <>
      <path d="M10 17.3c3.2-3.4 5.3-6.2 5.3-8.7a5.3 5.3 0 1 0-10.6 0c0 2.5 2.1 5.3 5.3 8.7z" />
      <circle cx="10" cy="8.5" r="2" />
    </>
  ),

  /** Clock with a circular arrow. Version history. */
  revisions: (
    <>
      <path d="M3.5 7.4A7 7 0 1 1 3 10.4" />
      <path d="M2.2 4.2v3.4h3.4" />
      <path d="M10 6.5V10l2.6 1.6" />
    </>
  ),

  /** Bar chart on an axis. */
  reports: (
    <>
      <path d="M4 3.5v12.9h12.4" />
      <path d="M7 16.4v-4.6" />
      <path d="M10.6 16.4V7.2" />
      <path d="M14.2 16.4v-6.6" />
    </>
  ),

  /* ---------------------------------------------------------------- actions */

  /** Tray with an arrow leaving it. */
  export: (
    <>
      <path d="M10 12.6V3.4" />
      <path d="M6.6 6.8L10 3.4l3.4 3.4" />
      <path d="M4 12.2v3.1a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6v-3.1" />
    </>
  ),

  /** Tray with an arrow dropping into it. */
  import: (
    <>
      <path d="M10 3.4v9.2" />
      <path d="M6.6 9.2L10 12.6l3.4-3.4" />
      <path d="M4 12.2v3.1a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6v-3.1" />
    </>
  ),

  /** Three connected nodes. */
  share: (
    <>
      <circle cx="15" cy="5" r="2.2" />
      <circle cx="5" cy="10" r="2.2" />
      <circle cx="15" cy="15" r="2.2" />
      <path d="M7 8.9l6-2.8" />
      <path d="M7 11.1l6 2.8" />
    </>
  ),

  /** Viewfinder corners. Filmic, and exactly what focus mode does. */
  focus: (
    <>
      <path d="M3.5 7V4.9a1.4 1.4 0 0 1 1.4-1.4H7" />
      <path d="M13 3.5h2.1a1.4 1.4 0 0 1 1.4 1.4V7" />
      <path d="M16.5 13v2.1a1.4 1.4 0 0 1-1.4 1.4H13" />
      <path d="M7 16.5H4.9a1.4 1.4 0 0 1-1.4-1.4V13" />
      <circle cx="10" cy="10" r="1.6" />
    </>
  ),

  /** Stopwatch. */
  sprint: (
    <>
      <circle cx="10" cy="11.6" r="5.9" />
      <path d="M8 2.6h4" />
      <path d="M10 2.6v3.1" />
      <path d="M10 8.6v3l2.4 1.4" />
    </>
  ),

  /** Sticky note with a folded corner. */
  notes: (
    <>
      <path d="M4 5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 5v7.2l-4.3 4.3H5.5A1.5 1.5 0 0 1 4 15z" />
      <path d="M16 12.2h-2.8a1.5 1.5 0 0 0-1.5 1.5v2.8" />
    </>
  ),

  /** Dashed frame around text — material kept but switched off. */
  boneyard: (
    <>
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.6" strokeDasharray="2.6 2.4" />
      <path d="M6.6 9h6.8" />
      <path d="M6.6 12h4.2" />
    </>
  ),

  /** Luggage-style tag. */
  tag: (
    <>
      <path d="M3.5 9.6V4.9a1.4 1.4 0 0 1 1.4-1.4h4.7a1.4 1.4 0 0 1 1 .4l5.5 5.5a1.4 1.4 0 0 1 0 2l-4.7 4.7a1.4 1.4 0 0 1-2 0L3.9 10.6a1.4 1.4 0 0 1-.4-1z" />
      <circle cx="7" cy="7" r="1.3" />
    </>
  ),

  /** Story beat marker. */
  beat: (
    <>
      <path d="M10 3.2l3.3 3.3a1.4 1.4 0 0 1 0 2L10 16.8l-3.3-8.3a1.4 1.4 0 0 1 0-2z" />
    </>
  ),

  /** Checkbox with a tick. Writer to-dos. */
  todo: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.4" />
      <path d="M6.8 10.2l2.4 2.4 4.2-5" />
    </>
  ),

  /** A cloud. Projects that sync. */
  cloud: (
    <path d="M6.2 15.5h8a3.3 3.3 0 0 0 .5-6.6 4.6 4.6 0 0 0-8.9 1.2 2.7 2.7 0 0 0 .4 5.4z" />
  ),

  /** A laptop. Projects that live on this computer only. */
  device: (
    <>
      <rect x="4" y="4.5" width="12" height="8.5" rx="1.4" />
      <path d="M2.8 15.5h14.4" />
    </>
  ),

  trash: (
    <>
      <path d="M4 6h12" />
      <path d="M8 6V4.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6" />
      <path d="M5.5 6l.8 9.4a1.4 1.4 0 0 0 1.4 1.3h4.6a1.4 1.4 0 0 0 1.4-1.3l.8-9.4" />
    </>
  ),

  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.6" />
      <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6a1.5 1.5 0 0 0 1.5 1.5H7" />
    </>
  ),

  user: (
    <>
      <circle cx="10" cy="7.2" r="3" />
      <path d="M4.4 16.6c0-3 2.5-5.3 5.6-5.3s5.6 2.3 5.6 5.3" />
    </>
  ),

  /** An arrow into a cloud: move this project to the cloud. */
  upload: (
    <>
      <path d="M10 15V8.4" />
      <path d="M7.4 10.8L10 8.2l2.6 2.6" />
      <path d="M6 15.5h-.2a2.7 2.7 0 0 1-.3-5.4 4.6 4.6 0 0 1 8.9-1.2 3.3 3.3 0 0 1-.4 6.6h-.1" />
    </>
  ),

  lock: (
    <>
      <rect x="4.2" y="8.8" width="11.6" height="7.8" rx="1.8" />
      <path d="M6.9 8.8V6.6a3.1 3.1 0 0 1 6.2 0v2.2" />
    </>
  ),

  /* ------------------------------------------------------------------ chrome */

  search: (
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.7 12.7l4.1 4.1" />
    </>
  ),

  /** The ⌘ loop. */
  command: (
    <>
      <path d="M7.6 7.6h4.8v4.8H7.6z" />
      <path d="M7.6 7.6H5.7a2.1 2.1 0 1 1 2.1-2.1v2.1" />
      <path d="M12.4 7.6h1.9a2.1 2.1 0 1 0-2.1-2.1v2.1" />
      <path d="M12.4 12.4h1.9a2.1 2.1 0 1 1-2.1 2.1v-2.1" />
      <path d="M7.6 12.4H5.7a2.1 2.1 0 1 0 2.1 2.1v-2.1" />
    </>
  ),

  /** Sliders, not a gear — calmer and more macOS. */
  settings: (
    <>
      <path d="M3.5 5.6h9.2M15.2 5.6h1.3" />
      <circle cx="13.9" cy="5.6" r="1.9" />
      <path d="M3.5 10h2.6M8.6 10h7.9" />
      <circle cx="7.3" cy="10" r="1.9" />
      <path d="M3.5 14.4h6.3M12.3 14.4h4.2" />
      <circle cx="11" cy="14.4" r="1.9" />
    </>
  ),

  /** Panel with the left column marked. */
  sidebarLeft: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2.2" />
      <path d="M7.6 4v12" />
    </>
  ),

  /** Panel with the right column marked. */
  sidebarRight: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2.2" />
      <path d="M12.4 4v12" />
    </>
  ),

  chevronRight: <path d="M8 5l5 5-5 5" />,
  chevronDown: <path d="M5 8l5 5 5-5" />,
  chevronLeft: <path d="M12 5l-5 5 5 5" />,
  chevronUp: <path d="M5 12l5-5 5 5" />,

  plus: <path d="M10 4.4v11.2M4.4 10h11.2" />,
  close: <path d="M5.6 5.6l8.8 8.8M14.4 5.6l-8.8 8.8" />,
  check: <path d="M4.6 10.4l3.6 3.6 7.2-8" />,
  ellipsis: (
    <>
      <circle cx="5" cy="10" r="1.2" />
      <circle cx="10" cy="10" r="1.2" />
      <circle cx="15" cy="10" r="1.2" />
    </>
  ),

  /** Drag handle. */
  grip: (
    <>
      <circle cx="7.6" cy="5.4" r="1.15" />
      <circle cx="12.4" cy="5.4" r="1.15" />
      <circle cx="7.6" cy="10" r="1.15" />
      <circle cx="12.4" cy="10" r="1.15" />
      <circle cx="7.6" cy="14.6" r="1.15" />
      <circle cx="12.4" cy="14.6" r="1.15" />
    </>
  ),

  folder: (
    <path d="M3.5 6a1.6 1.6 0 0 1 1.6-1.6h2.6l1.7 2h5.5A1.6 1.6 0 0 1 16.5 8v6.5a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" />
  ),

  /** Half-filled disc — the appearance / theme control. */
  appearance: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" stroke="none" />
    </>
  ),

  /* ------------------------------------------------- screenplay elements
     Each of these draws where the element actually sits on the page. */

  /** Full-width line behind a heading tick. */
  elScene: (
    <>
      <path d="M3.6 7.2v5.6" />
      <path d="M6.6 10h9.8" />
    </>
  ),

  /** Three full-width lines. */
  elAction: (
    <>
      <path d="M3.6 6.4h12.8" />
      <path d="M3.6 10h12.8" />
      <path d="M3.6 13.6h8.4" />
    </>
  ),

  /** One short line, sitting where a cue sits — right of centre. */
  elCharacter: <path d="M7.4 10h5.2" />,

  /** Three lines at the dialogue indent and width. */
  elDialogue: (
    <>
      <path d="M5.6 6.4h8.8" />
      <path d="M5.6 10h8.8" />
      <path d="M5.6 13.6h5.6" />
    </>
  ),

  /** Literally a parenthetical. */
  elParenthetical: (
    <>
      <path d="M7.6 7.4a4.6 4.6 0 0 0 0 5.2" />
      <path d="M12.4 7.4a4.6 4.6 0 0 1 0 5.2" />
      <path d="M9.2 10h1.6" />
    </>
  ),

  /** One short line, flush right. */
  elTransition: <path d="M9.8 10h6.6" />,

  /** Two symmetrical lines about the centre. */
  elCentered: (
    <>
      <path d="M5.8 7.6h8.4" />
      <path d="M7.4 12.4h5.2" />
    </>
  ),

  /** Two eighth notes. */
  elLyrics: (
    <>
      <path d="M8.2 14V5.4l5.4-1.3v8.6" />
      <circle cx="6.5" cy="14" r="1.8" />
      <circle cx="11.9" cy="12.7" r="1.8" />
    </>
  ),

  /** The # glyph. */
  elSection: (
    <>
      <path d="M7.7 4.4L6.1 15.6" />
      <path d="M13.3 4.4l-1.6 11.2" />
      <path d="M4.6 8.2h10.8" />
      <path d="M4 11.8h10.8" />
    </>
  ),

  /** The = glyph. */
  elSynopsis: (
    <>
      <path d="M3.6 7.8h12.8" />
      <path d="M3.6 12.2h12.8" />
    </>
  ),

  /** Double brackets — the note delimiter. */
  elNote: (
    <>
      <path d="M8.2 4.6H5.4v10.8h2.8" />
      <path d="M11.8 4.6h2.8v10.8h-2.8" />
      <path d="M9.4 8.4h1.2M9.4 11.6h1.2" />
    </>
  ),

  /** A broken rule between two page edges. */
  elPageBreak: (
    <>
      <path d="M5.4 4.4h9.2" />
      <path d="M3.6 10h2.6M8.7 10h2.6M13.8 10h2.6" />
      <path d="M5.4 15.6h9.2" />
    </>
  ),

  /** Two columns of dialogue side by side. */
  elDualDialogue: (
    <>
      <path d="M3.5 6.6h5.2" />
      <path d="M3.5 10h5.2" />
      <path d="M3.5 13.4h3.2" />
      <path d="M11.3 6.6h5.2" />
      <path d="M11.3 10h5.2" />
      <path d="M11.3 13.4h3.2" />
    </>
  ),

  /** A page with a centred title block. */
  elTitlePage: (
    <>
      <rect x="4.4" y="2.6" width="11.2" height="14.8" rx="1.6" />
      <path d="M7.4 7.4h5.2" />
      <path d="M8.6 10.2h2.8" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;

export const iconPaths: Record<IconName, ReactElement> = paths;

export const iconNames = Object.keys(paths) as IconName[];
