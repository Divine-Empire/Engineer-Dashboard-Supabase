import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-56 2xl:ml-60 h-screen">
        <Header onMenuClick={() => setSidebarOpen(true)} user={user} />

        <main className="flex-1 flex flex-col p-5 md:p-6 overflow-hidden min-h-0 bg-slate-50">
          <div className="w-full max-w-[1800px] mx-auto flex-1 flex flex-col min-h-0">
            <Outlet />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
