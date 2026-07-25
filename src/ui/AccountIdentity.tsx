import { useEffect, useState } from 'react';
import { fetchAccountAvatar, revokeAvatarObjectUrl } from '../avatarClient';

type AccountIdentityProps = {
  address: string;
  actions: readonly string[];
};

function fallbackCharacter(address: string) {
  return Array.from(address)[0] ?? '?';
}

/**
 * A presentational identity row for data the Game Room already has. It never
 * changes the QCH1 authority model: the full sender/player address remains
 * visible alongside an optional, host-resolved image.
 */
export function AccountIdentity({ address, actions }: AccountIdentityProps) {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let objectUrl: string | null = null;

    const load = async () => {
      const result = await fetchAccountAvatar(address, actions);

      if (cancelled) {
        if (result.kind === 'ready') revokeAvatarObjectUrl(result.src);
        return;
      }

      if (result.kind === 'pending') {
        retryTimer = setTimeout(load, result.retryAfterSeconds * 1_000);
        return;
      }

      if (result.kind === 'ready') {
        objectUrl = result.src;
        setAvatarSrc(result.src);
      }
    };

    setAvatarSrc(null);
    void load();

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      revokeAvatarObjectUrl(objectUrl);
    };
  }, [actions, address]);

  return (
    <span className="account-identity">
      {avatarSrc ? (
        <img className="account-avatar" src={avatarSrc} alt="" />
      ) : (
        <span className="account-avatar account-avatar-fallback" aria-hidden="true">{fallbackCharacter(address)}</span>
      )}
      <code className="account-address">{address}</code>
    </span>
  );
}
