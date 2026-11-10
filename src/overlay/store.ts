import { create } from 'zustand';

import type { Post } from '@/model/post';

export type OverlayRequest =
  | { kind: 'qr'; accountId: string; handle: string; acting?: string }
  | { kind: 'mute'; accountId: string; acting?: string }
  | { kind: 'react'; status: Post; acting?: string }
  | { kind: 'reactors'; status: Post; acting?: string };

type OverlayState = {
  seq: number;
  request: OverlayRequest | null;
  open: (request: OverlayRequest) => void;
  close: () => void;
};

export const useOverlay = create<OverlayState>((set) => ({
  seq: 0,
  request: null,
  open: (request) => set((state) => ({ request, seq: state.seq + 1 })),
  close: () => set({ request: null }),
}));
