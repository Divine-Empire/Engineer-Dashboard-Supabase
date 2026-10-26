import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layout';
import Login from '../pages/auth/Login';

// Each page is its own chunk, loaded on first visit (Layout wraps <Outlet /> in Suspense).
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const VideoCall = lazy(() => import('../pages/Video-Call/Video-Call'));
const MaterialTesting = lazy(() => import('../pages/Material-Testing/MaterialTesting'));
const RepairStatus = lazy(() => import('../pages/Repair-Status/repair-status'));
const ServiceInstallation = lazy(() => import('../pages/service-installation/service-installation'));
const TADA = lazy(() => import('../pages/TADA/TADA'));
const SiteVisitOTPVerification = lazy(() => import('../pages/OTP-Verification/SiteVisitOTPVerification'));

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="/video-call" element={<VideoCall />} />
          <Route path="/material-testing" element={<MaterialTesting />} />
          <Route path="/repair-status" element={<RepairStatus />} />
          <Route path="/service-installation" element={<ServiceInstallation />} />
          <Route path="/tada" element={<TADA />} />
          <Route path="/site-visit-otp-verification" element={<SiteVisitOTPVerification />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>


    </>
  );
}
