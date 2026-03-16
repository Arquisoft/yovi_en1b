import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

