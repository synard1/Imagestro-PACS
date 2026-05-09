/**
 * LoginApp - Ultra Minimal Login Application
 *
 * This is a COMPLETELY ISOLATED login application that:
 * - Uses StandaloneLogin (zero external dependencies)
 * - Does NOT import App.jsx
 * - Does NOT import any service files
 * - Does NOT import theme system
 * - Does NOT import storage manager
 * - Does NOT import logger
 * - Has ZERO knowledge of the main application
 *
 * This ensures the login page bundle is ULTRA minimal and secure.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StandaloneLogin from './pages/StandaloneLogin'

export default function LoginApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<StandaloneLogin />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
