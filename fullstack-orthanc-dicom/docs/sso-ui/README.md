# SSO Web UI

A modern, responsive Single Sign-On (SSO) Web UI for the Fullstack Orthanc DICOM Healthcare System. Built with React, Vite, and Tailwind CSS.

## Features

### 🔐 Authentication & Authorization
- **JWT-based Authentication** with access and refresh tokens
- **Role-Based Access Control (RBAC)** with granular permissions
- **Multi-Factor Authentication (MFA)** support (optional)
- **Session Management** with configurable timeouts
- **Remember Me** functionality
- **Password Reset** and account recovery

### 🎨 Modern UI/UX
- **Responsive Design** that works on desktop, tablet, and mobile
- **Dark/Light Theme** support with system preference detection
- **Accessibility Features** (WCAG 2.1 compliant)
- **Internationalization (i18n)** ready
- **Real-time Notifications** with toast messages
- **Loading States** and error boundaries

### 🏥 Healthcare Integration
- **DICOM Service Integration** with Orthanc
- **Modality Worklist (MWL)** management
- **Order Management** system
- **Patient Data** handling with privacy compliance
- **Audit Logging** for compliance requirements

### 🛡️ Security Features
- **CSRF Protection** against cross-site request forgery
- **XSS Protection** with Content Security Policy
- **Secure Headers** implementation
- **Input Validation** and sanitization
- **Rate Limiting** protection
- **Audit Trail** for all user actions

### ⚡ Performance
- **Code Splitting** for optimal loading
- **Lazy Loading** of components and routes
- **Caching Strategies** with React Query
- **Bundle Optimization** with Vite
- **Progressive Web App (PWA)** capabilities

## Technology Stack

- **Frontend Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: React Context + React Query
- **Form Handling**: React Hook Form
- **HTTP Client**: Axios
- **Authentication**: JWT with js-cookie
- **Icons**: Heroicons
- **Testing**: Vitest + Testing Library

## Project Structure

```
sso-ui/
├── public/                 # Static assets
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── ErrorBoundary.jsx
│   │   ├── Layout.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── NotificationContainer.jsx
│   │   ├── PermissionGate.jsx
│   │   └── ProtectedRoute.jsx
│   ├── contexts/          # React contexts
│   │   ├── AuthContext.jsx
│   │   ├── NotificationContext.jsx
│   │   └── ThemeContext.jsx
│   ├── pages/             # Page components
│   │   ├── services/      # Service integration pages
│   │   │   ├── MWL.jsx
│   │   │   ├── Orders.jsx
│   │   │   └── Orthanc.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Login.jsx
│   │   ├── Profile.jsx
│   │   ├── Settings.jsx
│   │   └── Users.jsx
│   ├── services/          # API services
│   │   └── api.js
│   ├── App.jsx           # Main app component
│   ├── main.jsx          # App entry point
│   └── index.css         # Global styles
├── .dockerignore
├── .env.example          # Environment variables template
├── Dockerfile            # Docker configuration
├── nginx.conf            # Nginx configuration
├── package.json          # Dependencies and scripts
├── postcss.config.js     # PostCSS configuration
├── tailwind.config.js    # Tailwind CSS configuration
└── vite.config.js        # Vite configuration
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Modern web browser

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd sso-ui

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

### Production Deployment
```bash
# Build for production
npm run build

# Deploy with Docker
docker-compose -f docker-compose.production.yml up -d

# Or deploy manually (see DEPLOYMENT.md for details)
```

### Testing
```bash
# Run all tests
npm run test:all

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage
npm run test:unit -- --coverage
```

📖 **Detailed Guides:**
- [Deployment Guide](./DEPLOYMENT.md) - Complete production deployment instructions
- [Testing Guide](./TESTING-GUIDE.md) - Comprehensive testing strategies

### Production Deployment

#### Using Docker Compose (Recommended)

1. **Build and start all services**:
   ```bash
   cd ../  # Go to project root
   docker-compose up -d sso-ui
   ```

2. **Access the application**:
   Navigate to `http://localhost:3000`

#### Manual Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Serve with a web server**:
   ```bash
   npm run preview
   # or use nginx, apache, etc.
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API Gateway URL | `http://localhost:8080` |
| `VITE_AUTH_SERVICE_URL` | Auth Service URL | `http://localhost:8081` |
| `VITE_APP_NAME` | Application name | `SSO Web UI` |
| `VITE_ENABLE_DARK_MODE` | Enable dark mode | `true` |
| `VITE_DEFAULT_THEME` | Default theme | `light` |
| `VITE_SESSION_TIMEOUT` | Session timeout | `30m` |

See `.env.example` for complete list of configuration options.

### API Integration

The SSO UI integrates with several backend services:

- **Auth Service** (`/auth/*`): User authentication and authorization
- **API Gateway** (`/api/*`): Centralized API routing
- **MWL Service** (`/api/mwl/*`): Modality Worklist management
- **Orthanc** (`/api/orthanc/*`): DICOM server integration
- **Orders Service** (`/api/orders/*`): Order management

## User Roles and Permissions

### Default Roles

1. **Super Admin**
   - Full system access
   - User and role management
   - System configuration

2. **Admin**
   - User management
   - Service configuration
   - Audit log access

3. **Radiologist**
   - DICOM image access
   - Report generation
   - Worklist management

4. **Technologist**
   - Modality operation
   - Worklist execution
   - Image acquisition

5. **Clerk**
   - Patient registration
   - Order entry
   - Basic reporting

### Permission System

Permissions are granular and include:
- `users.read`, `users.create`, `users.update`, `users.delete`
- `roles.read`, `roles.create`, `roles.update`, `roles.delete`
- `mwl.read`, `mwl.create`, `mwl.update`, `mwl.delete`
- `orders.read`, `orders.create`, `orders.update`, `orders.delete`
- `orthanc.read`, `orthanc.upload`, `orthanc.delete`
- `settings.read`, `settings.update`
- `audit.read`

## Security Considerations

### Authentication Security
- JWT tokens with configurable expiration
- Secure HTTP-only cookies for refresh tokens
- Automatic token refresh mechanism
- Session timeout with warning notifications

### Data Protection
- All API communications over HTTPS in production
- Input validation and sanitization
- XSS protection with CSP headers
- CSRF protection for state-changing operations

### Access Control
- Role-based access control (RBAC)
- Route-level protection
- Component-level permission gates
- API endpoint authorization

### Audit and Compliance
- Comprehensive audit logging
- User action tracking
- Login/logout events
- Failed authentication attempts

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run test:ui` - Run tests with UI

### Code Style

- ESLint configuration for React
- Prettier for code formatting
- Tailwind CSS for styling
- Component-based architecture

### Testing

- Unit tests with Vitest
- Component tests with Testing Library
- E2E tests (planned)
- Coverage reporting

## API Documentation

### Authentication Endpoints

```javascript
// Login
POST /auth/login
{
  "email": "user@example.com",
  "password": "password"
}

// Refresh token
POST /auth/refresh
{
  "refresh_token": "..."
}

// Logout
POST /auth/logout
```

### User Management

```javascript
// Get users
GET /api/users?page=1&limit=20

// Create user
POST /api/users
{
  "email": "user@example.com",
  "name": "User Name",
  "role": "technologist"
}

// Update user
PUT /api/users/:id
{
  "name": "Updated Name",
  "role": "radiologist"
}
```

## Troubleshooting

### Common Issues

1. **Login fails with 401 error**
   - Check if auth service is running
   - Verify JWT secret configuration
   - Check user credentials

2. **UI not loading**
   - Verify all environment variables
   - Check if API Gateway is accessible
   - Review browser console for errors

3. **Permission denied errors**
   - Check user role assignments
   - Verify permission configuration
   - Review RBAC setup

### Debugging

1. **Enable debug mode**:
   ```bash
   VITE_ENABLE_DEV_TOOLS=true npm run dev
   ```

2. **Check logs**:
   ```bash
   docker-compose logs sso-ui
   ```

3. **Network issues**:
   ```bash
   docker-compose exec sso-ui curl -f http://api-gateway:8888/health
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the troubleshooting guide

## Changelog

### v1.0.0
- Initial release
- Complete SSO implementation
- RBAC system
- Service integrations
- Modern UI/UX