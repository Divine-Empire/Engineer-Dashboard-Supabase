import React from 'react';
import { Bell, User, Menu, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const Header = ({ onMenuClick, user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();

  const getStageName = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return 'Dashboard';
    if (path.startsWith('/followup')) return 'Follow Up';
    if (path.startsWith('/tally')) return 'Tally';
    if (path.startsWith('/campaigns')) return 'Campaigns';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Dashboard';
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="flex justify-between items-center h-14 px-4 sm:px-6">

        {/* Left: Mobile hamburger */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="hidden lg:block">
            <p className="text-xl font-bold text-slate-800">{getStageName()}</p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">

          {/* Profile */}
          <div className="flex items-center gap-2.5 group cursor-pointer" onClick={handleLogout} title="Click to sign out">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-700">{user?.name || 'Admin'}</p>
              <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
                {user?.role === 'ADMIN' ? 'Administrator' : 'Employee'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shadow-sm group-hover:bg-indigo-700 transition-colors">
              <span className="text-xs font-bold text-white">{(user?.name || 'A')[0].toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;