import { useState } from 'react';

import { ActingAccount } from '@/auth/session';
import { MuteForm } from '@/components/mute-sheet';
import { ProfileQr } from '@/components/profile-qr-sheet';
import { Sheet } from '@/components/sheet';
import { useOverlay, type OverlayRequest } from '@/overlay/store';

export function OverlayHost() {
  const { request, seq, close } = useOverlay();
  const [shown, setShown] = useState<{ request: OverlayRequest; seq: number } | null>(null);
  if (request && shown?.seq !== seq) setShown({ request, seq });

  if (!shown) return null;
  return (
    <Sheet open={!!request} onClose={close}>
      <ActingAccount account={shown.request.acting}>
        {shown.request.kind === 'qr' ? (
          <ProfileQr key={shown.seq} id={shown.request.accountId} handle={shown.request.handle} />
        ) : (
          <MuteForm key={shown.seq} accountId={shown.request.accountId} onDone={close} />
        )}
      </ActingAccount>
    </Sheet>
  );
}
