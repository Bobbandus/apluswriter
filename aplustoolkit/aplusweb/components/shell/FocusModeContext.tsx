'use client';

import { createContext, useContext } from 'react';

/**
 * Whether the workspace is in focus mode. The workspace owns the state, since
 * it owns the chrome that focus mode hides; the editor reads it from here so
 * it can dim what is not being written and keep the caret line steady.
 */
export const FocusModeContext = createContext(false);

export const useFocusMode = () => useContext(FocusModeContext);
