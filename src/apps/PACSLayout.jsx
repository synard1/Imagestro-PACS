import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import PACSNavbar from '../components/navigation/PACSNavbar';
import WorklistPanel from '../components/navigation/WorklistPanel';
import StatusBar from '../components/navigation/StatusBar';
import QuickActions from '../components/navigation/QuickActions';

export default function PACSLayout() {
  const [worklistOpen, setWorklistOpen] = useState(true);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Navigation */}
      <PACSNavbar 
        onToggleWorklist={() => setWorklistOpen(!worklistOpen)}
        onToggleQuickActions={() => setQuickActionsOpen(!quickActionsOpen)}
        worklistOpen={worklistOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Worklist Panel */}
        {worklistOpen && (
          <WorklistPanel 
            onClose={() => setWorklistOpen(false)}
            onStudySelect={(studyId) => navigate(`/viewer/${studyId}`)}
          />
        )}

        {/* Main Workspace */}
        <main className="flex-1 overflow-auto bg-white">
          <Outlet />
        </main>

        {/* Right Sidebar - Quick Actions (Optional) */}
        {quickActionsOpen && (
          <QuickActions onClose={() => setQuickActionsOpen(false)} />
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
}
