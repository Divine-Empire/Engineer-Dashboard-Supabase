import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Settings,
  LogOut as LogOutIcon,
  X,
  LayoutGrid,
  CreditCard,
  GitCompare,
  Megaphone,
  Wallet,
  Phone,
  Handshake,
  Wrench,
  ClipboardCheck,
  Car,
  ShieldCheck,
  ClipboardList
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const adminMenuItems = [
    { path: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
    { path: '/service-installation', icon: ClipboardCheck, label: 'Service Installation' },
    { path: '/video-call', icon: Phone, label: 'Video Call' },
    { path: '/repair-status', icon: Wrench, label: 'Repair Status' },
    { path: '/material-testing', icon: Handshake, label: 'Material Testing' },
    { path: '/tada', icon: Car, label: 'TADA' },
    { path: '/site-visit-otp-verification', icon: ShieldCheck, label: 'OTP Verification' },
    { path: '/site-visit-detail', icon: ClipboardList, label: 'Site Visit Detail' },
    // { path: '/tally',       icon: GitCompare,   label: 'Tally' },
    // { path: '/campaigns',   icon: Megaphone,    label: 'Campaigns' },
    // { path: '/settings',    icon: Settings,     label: 'Settings' },
  ];

  const employeeMenuItems = [
    { path: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
    { path: '/service-installation', icon: ClipboardCheck, label: 'Service Installation' },
    { path: '/video-call', icon: Phone, label: 'Video Call' },
    { path: '/repair-status', icon: Wrench, label: 'Repair Status' },
    { path: '/material-testing', icon: Handshake, label: 'Material Testing' },
    { path: '/tada', icon: Car, label: 'TADA' },
    { path: '/site-visit-otp-verification', icon: ShieldCheck, label: 'OTP Verification' },
    { path: '/site-visit-detail', icon: ClipboardList, label: 'Site Visit Detail' },
    // { path: '/tally',       icon: GitCompare,   label: 'Tally' },
    // { path: '/campaigns',   icon: Megaphone,    label: 'Campaigns' },
  ];

  const menuItems = user?.role === 'ADMIN' ? adminMenuItems : employeeMenuItems;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 sm:w-72 lg:w-56 2xl:w-60 bg-white border-r border-slate-200 z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Wallet size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">Engineer's Dashboard</span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-hide">
          <p className="px-3 pt-2 pb-1 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</p>
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group
                ${isActive
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 font-medium'}
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={17} className={isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} />
                  <span className="text-sm">{item.label}</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-indigo-600">{(user?.name || 'U')[0].toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{user?.role || 'EMPLOYEE'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-600 hover:text-white transition-all font-semibold text-xs"
          >
            <LogOutIcon size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;