import { create } from 'zustand';

import type { Post } from '@/model/post';

export type FocusableList = {
  statuses: Post[];
  open: (status: Post) => void;
  scrollTo: (index: number) => void;
  top: () => void;
};

type State = {
  list: FocusableList | null;
  focusedId: string | null;
};

export function stepIndex(ids: readonly string[], current: string | null, delta: 1 | -1) {
  if (ids.length === 0) return -1;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index === -1) return 0;
  return Math.min(Math.max(index + delta, 0), ids.length - 1);
}

export const useFocusStore = create<State>(() => ({ list: null, focusedId: null }));

export const registerList = (list: FocusableList) => {
  useFocusStore.setState({ list });
  return () => {
    if (useFocusStore.getState().list === list) useFocusStore.setState({ list: null });
  };
};

export const focusStatus = (id: string) => {
  if (useFocusStore.getState().focusedId !== id) useFocusStore.setState({ focusedId: id });
};

export function moveFocus(delta: 1 | -1) {
  const { list, focusedId } = useFocusStore.getState();
  if (!list) return;
  const index = stepIndex(list.statuses.map((s) => s.key), focusedId, delta);
  if (index === -1) return;
  useFocusStore.setState({ focusedId: list.statuses[index].key });
  list.scrollTo(index);
}

export function focusedStatus() {
  const { list, focusedId } = useFocusStore.getState();
  return list?.statuses.find((s) => s.key === focusedId);
}
