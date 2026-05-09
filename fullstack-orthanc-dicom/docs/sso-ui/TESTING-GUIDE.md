# SSO Web UI - Testing Guide untuk Production

## 📋 Daftar Isi

- [Overview Testing](#overview-testing)
- [Persiapan Testing Environment](#persiapan-testing-environment)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)
- [Production Testing Checklist](#production-testing-checklist)
- [Automated Testing Pipeline](#automated-testing-pipeline)

## 🎯 Overview Testing

### Testing Strategy
1. **Unit Tests**: Test komponen individual dan fungsi utility
2. **Integration Tests**: Test interaksi antar komponen dan API
3. **E2E Tests**: Test user journey lengkap
4. **Performance Tests**: Test load dan response time
5. **Security Tests**: Test keamanan dan vulnerability

### Testing Environment
- **Development**: Local testing dengan mock data
- **Staging**: Testing dengan data production-like
- **Production**: Monitoring dan health checks

## 🔧 Persiapan Testing Environment

### 1. Setup Testing Dependencies
```bash
# Install testing dependencies
npm install --save-dev \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  vitest \
  @vitest/ui \
  jsdom \
  msw \
  playwright

# Install coverage tools
npm install --save-dev @vitest/coverage-v8
```

### 2. Environment Configuration
```bash
# Create test environment file
cp .env.example .env.test

# Configure test environment
cat > .env.test << EOF
VITE_API_BASE_URL=http://localhost:8888
VITE_AUTH_SERVICE_URL=http://localhost:3001
VITE_ENABLE_MOCK_DATA=true
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug
EOF
```

### 3. Test Database Setup
```sql
-- Create test database
CREATE DATABASE sso_test;
GRANT ALL PRIVILEGES ON sso_test.* TO 'sso_user'@'%';

-- Seed test data
INSERT INTO users (username, email, role) VALUES 
('testuser', 'test@example.com', 'user'),
('testadmin', 'admin@example.com', 'admin');
```

## 🧪 Unit Testing

### 1. Component Testing
```javascript
// src/components/__tests__/LoginForm.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import LoginForm from '../LoginForm'
import { AuthContext } from '../../contexts/AuthContext'

const mockLogin = vi.fn()
const mockAuthContext = {
  login: mockLogin,
  isLoading: false,
  error: null
}

const renderWithContext = (component) => {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      {component}
    </AuthContext.Provider>
  )
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders login form correctly', () => {
    renderWithContext(<LoginForm />)
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('submits form with correct data', async () => {
    renderWithContext(<LoginForm />)
    
    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'password123'
      })
    })
  })

  test('displays validation errors', async () => {
    renderWithContext(<LoginForm />)
    
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
  })
})
```

### 2. Hook Testing
```javascript
// src/hooks/__tests__/useAuth.test.js
import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { useAuth } from '../useAuth'
import * as authService from '../../services/authService'

vi.mock('../../services/authService')

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  test('login success updates state correctly', async () => {
    const mockUser = { id: 1, username: 'testuser', role: 'user' }
    const mockToken = 'mock-jwt-token'
    
    authService.login.mockResolvedValue({
      user: mockUser,
      token: mockToken
    })

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.login('testuser', 'password123')
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(localStorage.getItem('token')).toBe(mockToken)
  })

  test('login failure handles error correctly', async () => {
    const mockError = new Error('Invalid credentials')
    authService.login.mockRejectedValue(mockError)

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.login('testuser', 'wrongpassword')
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.error).toBe('Invalid credentials')
  })
})
```

### 3. Utility Function Testing
```javascript
// src/utils/__tests__/validation.test.js
import { validateEmail, validatePassword, validateUsername } from '../validation'

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    test('validates correct email formats', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true)
    })

    test('rejects invalid email formats', () => {
      expect(validateEmail('invalid-email')).toBe(false)
      expect(validateEmail('test@')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
    })
  })

  describe('validatePassword', () => {
    test('validates strong passwords', () => {
      expect(validatePassword('StrongPass123!')).toBe(true)
      expect(validatePassword('AnotherGood1@')).toBe(true)
    })

    test('rejects weak passwords', () => {
      expect(validatePassword('weak')).toBe(false)
      expect(validatePassword('12345678')).toBe(false)
      expect(validatePassword('onlylowercase')).toBe(false)
    })
  })
})
```

## 🔗 Integration Testing

### 1. API Integration Testing
```javascript
// src/services/__tests__/authService.test.js
import { vi } from 'vitest'
import { authService } from '../authService'
import { setupServer } from 'msw/node'
import { rest } from 'msw'

const server = setupServer(
  rest.post('/api/auth/login', (req, res, ctx) => {
    const { username, password } = req.body
    
    if (username === 'testuser' && password === 'password123') {
      return res(ctx.json({
        user: { id: 1, username: 'testuser', role: 'user' },
        token: 'mock-jwt-token'
      }))
    }
    
    return res(ctx.status(401), ctx.json({ message: 'Invalid credentials' }))
  }),

  rest.get('/api/auth/me', (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization')
    
    if (authHeader === 'Bearer mock-jwt-token') {
      return res(ctx.json({
        id: 1,
        username: 'testuser',
        role: 'user'
      }))
    }
    
    return res(ctx.status(401), ctx.json({ message: 'Unauthorized' }))
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('AuthService Integration', () => {
  test('login with valid credentials', async () => {
    const result = await authService.login('testuser', 'password123')
    
    expect(result.user.username).toBe('testuser')
    expect(result.token).toBe('mock-jwt-token')
  })

  test('login with invalid credentials throws error', async () => {
    await expect(
      authService.login('testuser', 'wrongpassword')
    ).rejects.toThrow('Invalid credentials')
  })

  test('getCurrentUser with valid token', async () => {
    localStorage.setItem('token', 'mock-jwt-token')
    
    const user = await authService.getCurrentUser()
    
    expect(user.username).toBe('testuser')
  })
})
```

### 2. Component Integration Testing
```javascript
// src/pages/__tests__/Dashboard.integration.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '../Dashboard'
import { AuthContext } from '../../contexts/AuthContext'

const createWrapper = ({ user = null } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  const authContext = {
    user,
    isAuthenticated: !!user,
    isLoading: false
  }

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthContext.Provider value={authContext}>
          {children}
        </AuthContext.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Dashboard Integration', () => {
  test('renders dashboard for authenticated user', async () => {
    const mockUser = { id: 1, username: 'testuser', role: 'user' }
    const Wrapper = createWrapper({ user: mockUser })

    render(<Dashboard />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByText(/welcome, testuser/i)).toBeInTheDocument()
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument()
    })
  })

  test('shows admin features for admin users', async () => {
    const mockAdmin = { id: 1, username: 'admin', role: 'admin' }
    const Wrapper = createWrapper({ user: mockAdmin })

    render(<Dashboard />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByText(/admin panel/i)).toBeInTheDocument()
      expect(screen.getByText(/user management/i)).toBeInTheDocument()
    })
  })
})
```

## 🎭 End-to-End Testing

### 1. Playwright E2E Tests
```javascript
// tests/e2e/auth.spec.js
import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
  })

  test('user can login successfully', async ({ page }) => {
    // Navigate to login page
    await page.click('text=Sign In')
    
    // Fill login form
    await page.fill('[data-testid=username-input]', 'testuser')
    await page.fill('[data-testid=password-input]', 'password123')
    
    // Submit form
    await page.click('[data-testid=login-button]')
    
    // Verify successful login
    await expect(page).toHaveURL(/.*dashboard/)
    await expect(page.locator('text=Welcome, testuser')).toBeVisible()
  })

  test('user sees error with invalid credentials', async ({ page }) => {
    await page.click('text=Sign In')
    
    await page.fill('[data-testid=username-input]', 'testuser')
    await page.fill('[data-testid=password-input]', 'wrongpassword')
    
    await page.click('[data-testid=login-button]')
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible()
  })

  test('user can logout', async ({ page }) => {
    // Login first
    await page.click('text=Sign In')
    await page.fill('[data-testid=username-input]', 'testuser')
    await page.fill('[data-testid=password-input]', 'password123')
    await page.click('[data-testid=login-button]')
    
    // Logout
    await page.click('[data-testid=user-menu]')
    await page.click('text=Logout')
    
    // Verify logout
    await expect(page).toHaveURL(/.*login/)
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('http://localhost:3000/login')
    await page.fill('[data-testid=username-input]', 'testuser')
    await page.fill('[data-testid=password-input]', 'password123')
    await page.click('[data-testid=login-button]')
  })

  test('user can navigate to different pages', async ({ page }) => {
    // Test navigation to profile
    await page.click('text=Profile')
    await expect(page).toHaveURL(/.*profile/)
    
    // Test navigation to settings
    await page.click('text=Settings')
    await expect(page).toHaveURL(/.*settings/)
    
    // Test navigation back to dashboard
    await page.click('text=Dashboard')
    await expect(page).toHaveURL(/.*dashboard/)
  })
})
```

### 2. Playwright Configuration
```javascript
// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## ⚡ Performance Testing

### 1. Load Testing dengan Artillery
```yaml
# artillery-config.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100

scenarios:
  - name: "Login Flow"
    weight: 70
    flow:
      - get:
          url: "/login"
      - post:
          url: "/api/auth/login"
          json:
            username: "testuser"
            password: "password123"
      - get:
          url: "/dashboard"

  - name: "Browse Pages"
    weight: 30
    flow:
      - get:
          url: "/dashboard"
      - get:
          url: "/profile"
      - get:
          url: "/settings"
```

### 2. Performance Monitoring
```javascript
// src/utils/performance.js
export const measurePerformance = (name, fn) => {
  return async (...args) => {
    const start = performance.now()
    
    try {
      const result = await fn(...args)
      const end = performance.now()
      
      // Log performance metrics
      console.log(`${name} took ${end - start} milliseconds`)
      
      // Send to analytics in production
      if (import.meta.env.PROD) {
        fetch('/api/analytics/performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            duration: end - start,
            timestamp: new Date().toISOString()
          })
        })
      }
      
      return result
    } catch (error) {
      const end = performance.now()
      console.error(`${name} failed after ${end - start} milliseconds`, error)
      throw error
    }
  }
}

// Usage example
export const loginWithPerformance = measurePerformance('login', authService.login)
```

## 🔒 Security Testing

### 1. Security Test Cases
```javascript
// tests/security/auth.security.test.js
import { test, expect } from '@playwright/test'

test.describe('Security Tests', () => {
  test('prevents XSS attacks', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    
    // Try XSS in username field
    await page.fill('[data-testid=username-input]', '<script>alert("XSS")</script>')
    await page.fill('[data-testid=password-input]', 'password123')
    await page.click('[data-testid=login-button]')
    
    // Verify script is not executed
    const alerts = []
    page.on('dialog', dialog => {
      alerts.push(dialog.message())
      dialog.dismiss()
    })
    
    expect(alerts).toHaveLength(0)
  })

  test('prevents CSRF attacks', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/login')
    await page.fill('[data-testid=username-input]', 'testuser')
    await page.fill('[data-testid=password-input]', 'password123')
    await page.click('[data-testid=login-button]')
    
    // Try to make request without CSRF token
    const response = await page.evaluate(async () => {
      return fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hacker@evil.com' })
      })
    })
    
    expect(response.status).toBe(403)
  })

  test('enforces rate limiting', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    
    // Make multiple failed login attempts
    for (let i = 0; i < 6; i++) {
      await page.fill('[data-testid=username-input]', 'testuser')
      await page.fill('[data-testid=password-input]', 'wrongpassword')
      await page.click('[data-testid=login-button]')
      await page.waitForTimeout(100)
    }
    
    // Verify rate limiting is enforced
    await expect(page.locator('text=Too many attempts')).toBeVisible()
  })
})
```

### 2. JWT Security Testing
```javascript
// tests/security/jwt.security.test.js
import { vi } from 'vitest'
import { validateToken, isTokenExpired } from '../../src/utils/jwt'

describe('JWT Security', () => {
  test('rejects malformed tokens', () => {
    const malformedToken = 'invalid.token.here'
    expect(() => validateToken(malformedToken)).toThrow()
  })

  test('rejects expired tokens', () => {
    const expiredToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.signature'
    expect(isTokenExpired(expiredToken)).toBe(true)
  })

  test('accepts valid tokens', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    const validToken = createMockToken({ exp: futureTimestamp })
    expect(isTokenExpired(validToken)).toBe(false)
  })
})
```

## ✅ Production Testing Checklist

### Pre-Deployment Testing
- [ ] All unit tests pass (100% coverage for critical paths)
- [ ] Integration tests pass
- [ ] E2E tests pass on all supported browsers
- [ ] Performance tests meet SLA requirements
- [ ] Security tests pass
- [ ] Accessibility tests pass (WCAG 2.1 AA)
- [ ] Mobile responsiveness verified
- [ ] Cross-browser compatibility verified

### Deployment Testing
- [ ] Health check endpoint responds correctly
- [ ] Database connections working
- [ ] External API integrations working
- [ ] SSL/TLS certificates valid
- [ ] Environment variables configured correctly
- [ ] Logging and monitoring active
- [ ] Backup systems functional

### Post-Deployment Testing
- [ ] User authentication flow works
- [ ] All major user journeys functional
- [ ] Performance metrics within acceptable range
- [ ] Error rates below threshold
- [ ] Security headers present
- [ ] HTTPS redirect working
- [ ] CDN/caching working correctly

### Smoke Tests for Production
```bash
#!/bin/bash
# smoke-tests.sh

BASE_URL="https://your-domain.com"
API_URL="$BASE_URL/api"

echo "Running production smoke tests..."

# Test 1: Health check
echo "Testing health check..."
curl -f "$API_URL/health" || exit 1

# Test 2: Login page loads
echo "Testing login page..."
curl -f "$BASE_URL/login" | grep -q "Sign In" || exit 1

# Test 3: API authentication
echo "Testing API authentication..."
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' | \
  jq -r '.token')

if [ "$TOKEN" = "null" ]; then
  echo "Authentication failed"
  exit 1
fi

# Test 4: Protected endpoint
echo "Testing protected endpoint..."
curl -f -H "Authorization: Bearer $TOKEN" "$API_URL/user/profile" || exit 1

# Test 5: Database connectivity
echo "Testing database connectivity..."
curl -f -H "Authorization: Bearer $TOKEN" "$API_URL/users" || exit 1

echo "All smoke tests passed!"
```

## 🚀 Automated Testing Pipeline

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm audit
      - run: npm run test:security
```

### 2. Test Scripts dalam package.json
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.js",
    "test:e2e": "playwright test",
    "test:security": "npm audit && vitest run --config vitest.security.config.js",
    "test:performance": "artillery run artillery-config.yml",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

## 📊 Test Reporting

### 1. Coverage Reports
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
})
```

### 2. Test Results Dashboard
```html
<!-- test-results.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Test Results Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div id="coverage-chart"></div>
    <div id="test-results"></div>
    
    <script>
        // Load and display test results
        fetch('/api/test-results')
            .then(response => response.json())
            .then(data => {
                // Render charts and tables
                renderCoverageChart(data.coverage)
                renderTestResults(data.results)
            })
    </script>
</body>
</html>
```

---

## 🎯 Testing Best Practices

1. **Test Pyramid**: Lebih banyak unit tests, sedikit integration tests, minimal E2E tests
2. **Test Isolation**: Setiap test harus independent dan dapat dijalankan sendiri
3. **Mock External Dependencies**: Gunakan mocks untuk API calls dan external services
4. **Test Data Management**: Gunakan factories atau fixtures untuk test data
5. **Continuous Testing**: Jalankan tests pada setiap commit dan deployment
6. **Performance Monitoring**: Monitor performance metrics di production
7. **Security Testing**: Regular security audits dan penetration testing

**⚠️ Penting**: Jangan pernah menjalankan destructive tests di production environment!