# Gemini Project Context: MWL-PACS-UI

This document provides a comprehensive overview of the MWL-PACS-UI project to be used as instructional context for future interactions.

## Project Overview

This is a frontend application for a Radiology Modality Worklist (MWL) and mini-Picture Archiving and Communication System (PACS). It is built as a single-page application using React and Vite. The application is designed to work with a REST API backend, but also includes a full mock data layer for standalone development and testing.

**Key Technologies:**

*   **Frontend:** React, Vite, React Router, TailwindCSS
*   **Backend (mock/example):** Node.js, Express
*   **State Management:** React Hooks and Context API
*   **Data Fetching:** Custom API service with backend/mock duality

## Key Features

*   **Dual Data Source:** The application can fetch data from a live backend API or from local JSON files (`src/data/*.json`). This is configurable and includes a graceful fallback to mock data if the backend is unavailable.
*   **Comprehensive Authentication:** A robust, token-based authentication system is in place, supporting both a local mock authentication for development and a full-featured backend authentication flow (JWT with refresh tokens). See `docs/AUTH_SYSTEM.md` for a detailed explanation.
*   **Role-Based Access Control (RBAC):** The application features a permission-based RBAC system to control access to different pages and features. Permissions are defined for roles and checked using the `ProtectedRoute` component.
*   **Component-Based Architecture:** The UI is built with a clear structure of reusable components, pages, and services.
*   **Lazy Loading:** All application pages are lazy-loaded to improve initial performance and reduce the initial bundle size.

## Project Structure

*   `src/`: Contains all the frontend source code.
    *   `components/`: Reusable React components.
    *   `pages/`: Top-level page components corresponding to application routes.
    *   `services/`: Modules for handling API calls, authentication, and other business logic.
    *   `hooks/`: Custom React hooks.
    *   `data/`: JSON files used for the mock data layer.
*   `server-data/`: A directory for data that might be used by the example server.
*   `docs/`: Contains detailed documentation about specific aspects of the project, such as the authentication system.
*   `start-server.js`: The entry point for running the example Node.js/Express server.

## Building and Running

### Prerequisites

*   Node.js and npm

### Installation

```bash
npm install
```

### Running the Development Server (Frontend)

This command starts the Vite development server, typically on `http://localhost:5173`.

```bash
npm run dev
```

### Building for Production

This command compiles the React application into static assets in the `dist/` directory.

```bash
npm run build
```

### Running the Example Backend Server

This command starts the example Node.js server, which can be used as a backend during development. It typically runs on `http://localhost:3001`.

```bash
npm run server
```

## Authentication

The authentication system is a core feature of this application.

*   **Configuration:** The authentication mode can be configured in the `.env` file by setting the `VITE_ENABLE_LOCAL_AUTH` variable.
    *   `true`: Enables a local mock authentication that uses data from `src/data/users.json`.
    *   `false`: Disables local auth and forces the application to use a real backend for authentication.
*   **Backend API:** The backend API endpoints for authentication are expected to follow the structure outlined in `docs/AUTH_SYSTEM.md`.
*   **Token Management:** The application uses JWT for authentication and includes an automatic token refresh mechanism.

## Backend Integration

The frontend communicates with the backend via the service layer in `src/services/`. The `api.js` service is designed to seamlessly switch between the mock data and a live backend.

*   **API Base URL:** The base URL for the backend API is configured in the `.env` file with the `VITE_API_BASE_URL` variable.
*   **Fallback Mechanism:** If the application is configured to use the backend and an API call fails (e.g., due to a network error), it will automatically fall back to using the corresponding mock data and display a notification to the user.
