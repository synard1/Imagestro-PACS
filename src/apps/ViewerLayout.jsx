import { Outlet } from 'react-router-dom';
import StatusBar from '../components/navigation/StatusBar';

export default function ViewerLayout() {
  return (
    <div className="h-screen flex flex-col bg-black">
      {/* Full Screen Viewer */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Minimal Status Bar */}
      <StatusBar minimal />
    </div>
  );
}
