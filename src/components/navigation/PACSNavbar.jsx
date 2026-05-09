import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  MagnifyingGlassIcon, 
  Bars3Icon,
  BellIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import SearchBar from '../common/SearchBar';
import NotificationCenter from '../common/NotificationCenter';

export default function PACSNavbar({ onToggleWorklist, worklistOpen }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <nav className="bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left Section */}
          <div className="flex items-center space-x-4">
            {/* Worklist Toggle */}
            <button
              onClick={onToggleWorklist}
              className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
              title="Toggle Worklist"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            {/* Logo & Title */}
            <Link to="/dashboard" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-blue-900 font-bold text-xl">P</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">PACS System</h1>
                <p className="text-xs text-blue-200">Picture Archiving & Communication</p>
              </div>
            </Link>
          </div>

          {/* Center Section - Search */}
          <div className="flex-1 max-w-2xl mx-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search studies, patients, accession numbers..."
                className="w-full px-4 py-2 pl-10 bg-blue-800 border border-blue-700 rounded-lg text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onFocus={() => setSearchOpen(true)}
              />
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-blue-300" />
            </div>
            {searchOpen && (
              <SearchBar onClose={() => setSearchOpen(false)} />
            )}
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 hover:bg-blue-700 rounded-lg transition-colors relative"
                title="Notifications"
              >
                <BellIcon className="h-6 w-6" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              {notificationsOpen && (
                <NotificationCenter onClose={() => setNotificationsOpen(false)} />
              )}
            </div>

            {/* Settings */}
            <Link
              to="/settings"
              className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
              title="Settings"
            >
              <Cog6ToothIcon className="h-6 w-6" />
            </Link>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-2 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <UserCircleIcon className="h-6 w-6" />
                <span className="text-sm font-medium">Dr. Admin</span>
              </button>
              
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl py-1 z-50">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Settings
                  </Link>
                  <Link
                    to="/impersonate-history"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    title="View impersonate session history"
                  >
                    Impersonate History
                  </Link>
                  <hr className="my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
