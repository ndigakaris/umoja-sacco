/**
 * App.js — Root component with routing
 * Protected routes check auth context before rendering
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import MemberProfilePage from './pages/MemberProfilePage';
import LoansPage from './pages/LoansPage';
import SavingsPage from './pages/SavingsPage';
import WelfarePage from './pages/WelfarePage';
import PenaltiesPage from './pages/PenaltiesPage';
import TransactionsPage from './pages/TransactionsPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Protect routes — redirect to /login if not authenticated
 */
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading UmojaSACCO...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes inside layout */}
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="members" element={
          <ProtectedRoute roles={['admin', 'treasurer', 'auditor']}>
            <MembersPage />
          </ProtectedRoute>
        } />
        <Route path="members/:id" element={<MemberProfilePage />} />
        <Route path="loans" element={<LoansPage />} />
        <Route path="savings" element={
          <ProtectedRoute roles={['admin', 'treasurer', 'auditor']}>
            <SavingsPage />
          </ProtectedRoute>
        } />
        <Route path="welfare" element={<WelfarePage />} />
        <Route path="penalties" element={<PenaltiesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="reports" element={
          <ProtectedRoute roles={['admin', 'treasurer', 'auditor']}>
            <ReportsPage />
          </ProtectedRoute>
        } />
        <Route path="audit" element={
          <ProtectedRoute roles={['admin', 'auditor']}>
            <AuditPage />
          </ProtectedRoute>
        } />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={
          <ProtectedRoute roles={['admin']}>
            <SettingsPage />
          </ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
