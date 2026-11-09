import { createContext, useContext } from 'react';

export const DetailContext = createContext<((id: string) => void) | null>(null);

export function useOpenInDetail() {
  return useContext(DetailContext);
}
