import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { expiryStatus, formatExpiry, type ExpiryStatus } from '../lib/expiry.ts';

const STATUS_LABEL: Record<ExpiryStatus, string> = {
  expired: 'Prošlé',
  soon: 'Brzy projde',
  ok: 'Platné',
  unknown: 'Bez data',
};

export function ExpiryBadge({ expiresOn }: { expiresOn: string | null }) {
  const status = expiryStatus(expiresOn);
  return (
    <span className={`badge ${status}`}>
      {expiresOn ? `${STATUS_LABEL[status]} · ${formatExpiry(expiresOn)}` : STATUS_LABEL[status]}
    </span>
  );
}

type RowProps = {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
} & ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export function Row({ title, subtitle, right, to, onClick }: RowProps) {
  const content = (
    <>
      <span className="row-text">
        <span className="row-title">{title}</span>
        {subtitle ? <span className="row-subtitle">{subtitle}</span> : null}
      </span>
      {right}
    </>
  );
  return (
    <li>
      {to ? (
        <Link className="row" to={to}>
          {content}
        </Link>
      ) : (
        <button type="button" className="row" onClick={onClick}>
          {content}
        </button>
      )}
    </li>
  );
}

export function PageHeader({ title, back, action }: { title?: string; back?: string; action?: ReactNode }) {
  return (
    <>
      {(back || action) && (
        <div className="page-header">
          {back ? (
            <BackLink fallback={back} />
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {title && <h1>{title}</h1>}
    </>
  );
}

/** Goes back in history; on a direct visit (nothing to go back to) opens `fallback`. */
function BackLink({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  return (
    <Link
      className="back"
      to={fallback}
      onClick={(event) => {
        // React Router keeps the position in the history stack as `idx`.
        if ((window.history.state?.idx ?? 0) > 0) {
          event.preventDefault();
          navigate(-1);
        }
      }}>
      ‹ Zpět
    </Link>
  );
}
