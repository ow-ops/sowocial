import { createContext } from 'react';

// Lists outside columns mode are always the keyboard target; a column provides whether it is the active one.
export const ColumnActiveContext = createContext(true);
