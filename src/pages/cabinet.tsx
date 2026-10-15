import { useEffect } from 'react';
import { Link } from 'react-router';

import { ExpiryBadge, Row } from '../components/ui.tsx';
import { useCabinetItems } from '../db/cabinet.ts';
import { expiryStatus } from '../lib/expiry.ts';

export function CabinetPage() {
  const items = useCabinetItems();
  const expired = items?.filter((i) => expiryStatus(i.expiresOn) === 'expired').length ?? 0;
  const soon = items?.filter((i) => expiryStatus(i.expiresOn) === 'soon').length ?? 0;

  // Home-screen icon badge (iOS 16.4+ and Android when installed).
  useEffect(() => {
    if (!items || !('setAppBadge' in navigator)) return;
    const count = expired + soon;
    (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [items, expired, soon]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Lékárnička</h1>
        <Link className="button" to="/add">
          + Přidat
        </Link>
      </div>

      {(expired > 0 || soon > 0) && (
        <p className="small muted">
          {[expired > 0 && `Prošlé: ${expired}`, soon > 0 && `Brzy projde: ${soon}`].filter(Boolean).join(' · ')}
        </p>
      )}

      {items && items.length === 0 && (
        <p className="empty">Lékárnička je prázdná. Přidejte první lék — vyhledejte ho podle názvu nebo účinné látky.</p>
      )}

      <ul className="list">
        {items?.map((item) => (
          <Row
            key={item.id}
            title={item.name}
            subtitle={item.detail}
            right={<ExpiryBadge expiresOn={item.expiresOn} />}
            to={`/item/${item.id}`}
          />
        ))}
      </ul>
    </div>
  );
}
