import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-shell">
      <TopBar />
      {/* All routed pages share the same shell, so the outlet stays centered here. */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

