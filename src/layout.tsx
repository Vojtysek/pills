import { Suspense } from 'react';
import { NavLink, Outlet, useRouteError } from 'react-router';

export function Layout() {
  return (
    <>
      <Suspense fallback={<div className="center">Načítám databázi léků…</div>}>
        <Outlet />
      </Suspense>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span className="icon">🧰</span>Lékárnička
        </NavLink>
        <NavLink to="/symptoms">
          <span className="icon">🤒</span>Potíže
        </NavLink>
        <NavLink to="/settings">
          <span className="icon">⚙️</span>Nastavení
        </NavLink>
      </nav>
    </>
  );
}

export function ErrorScreen() {
  const error = useRouteError();
  return (
    <div className="page">
      <h1>Něco se pokazilo</h1>
      <p className="error">{error instanceof Error ? error.message : String(error)}</p>
      <p className="muted small">Při prvním spuštění je potřeba připojení k internetu, aby se stáhla databáze léků.</p>
      <button className="button" type="button" onClick={() => location.reload()}>
        Zkusit znovu
      </button>
    </div>
  );
}
