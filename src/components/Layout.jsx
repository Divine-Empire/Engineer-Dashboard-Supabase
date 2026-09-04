import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : null;

  return (
    <div className="flex h-[100dvh] bg-white overflow-hidden">

      {/* Sidebar - Fixed on desktop, sliding on mobile */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-56 2xl:ml-60 transition-all h-[100dvh]">

        {/* Header - Sticky */}
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          user={user}
        />

        <main className="flex-1 flex flex-col p-1 sm:p-2 lg:p-3 overflow-hidden relative z-0 min-h-0">
          <div className="w-full max-w-[1800px] mx-auto flex-1 flex flex-col animate-in fade-in duration-500 min-h-0">
            <Outlet />
          </div>
        </main>


        <Footer />

      </div>
    </div>
  );
};

export default Layout;