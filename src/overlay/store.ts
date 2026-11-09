import { create } from 'zustand';

export type OverlayRequest =
  | { kind: 'qr'; accountId: string; handle: string; acting?: string }
  | { kind: 'mute'; accountId: string; acting?: string };

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
