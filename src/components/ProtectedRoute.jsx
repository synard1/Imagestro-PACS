// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Unauthorized from "../pages/Unauthorized.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "./ToastProvider.jsx";
import { loadRegistry } from "../services/api-registry.js";
import { getAuth } from "../services/auth-storage.js";
import { can, canAny, canAll } from "../services/rbac.js";

function isAdmin(user) {
  const role = (user?.role || "").toUpperCase();
  const perms = new Set((user?.permissions || []).map(p => p.replace(/:/g, '.')));
  return role === "ADMIN" || role === "SUPERADMIN" || role === "TENANT_ADMIN" || perms.has("*") || perms.has("admin.*");
}

export default function ProtectedRoute({ children, permissions = [], any = false }) {
  const location = useLocation();
  const { currentUser } = useAuth() || {};
  const toast = useToast();

  // Check if auth backend is enabled
  const registry = loadRegistry();
  const authConfig = registry.auth;
  const isBackendAuthEnabled = authConfig && authConfig.enabled;

  // Check if we're in the middle of an impersonate redirect
  const isImpersonateRedirecting = sessionStorage.getItem('impersonate.redirecting') === 'true';

  // Calculate permission check result BEFORE any returns
  const hasPermissions = !permissions || permissions.length === 0 || isAdmin(currentUser) || (
    any ? canAny(permissions, currentUser) : canAll(permissions, currentUser)
  );

  // Show toast notification for permission failures (must be at top level)
  useEffect(() => {
    if (!hasPermissions && currentUser && permissions && permissions.length > 0 && !isImpersonateRedirecting) {
      toast.notify({
        type: 'error',
        message: `You do not have permission to access the requested resource. Required: ${any ? permissions.join(' OR ') : permissions.join(' AND ')}`
      });
    }
  }, [hasPermissions, currentUser, permissions, any, isImpersonateRedirecting, toast]);

  // Handle impersonate redirect bypass
  if (isImpersonateRedirecting) {
    // Clear the flag
    sessionStorage.removeItem('impersonate.redirecting');
    // Allow access during impersonate transition
    return children;
  }

  // If backend auth is enabled, require authentication
  if (isBackendAuthEnabled) {
    // Check for valid user and token
    const authToken = getAuth();

    if (!currentUser || !currentUser.id || !authToken || !authToken.access_token) {
      // Not authenticated - redirect to login
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
  } else {
    // Backend auth disabled - allow access if no permissions required
    if (!currentUser && (!permissions || permissions.length === 0)) {
      return children;
    }

    // If permissions required but no user, redirect to login
    if (!currentUser && permissions && permissions.length > 0) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
  }

  // No permissions required - allow access
  if (!permissions || permissions.length === 0) {
    return children;
  }

  // Admin bypass - full access
  if (isAdmin(currentUser)) {
    return children;
  }

  // Check permissions
  if (!hasPermissions) {
    return <Unauthorized />;
  }

  return children;
}

