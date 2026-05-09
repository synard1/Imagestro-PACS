# RBAC (Role-Based Access Control) Documentation

This document outlines the permission-based access control for various features and menus within the MWL-PACS-UI application.

## Core Concepts

- **`ProtectedRoute`**: A component that wraps page routes in `src/App.jsx`. It checks if a user has the required permissions to access a specific page. If the user lacks the necessary permissions, they are redirected.
- **`PermissionGate`**: A component used within other components (like `src/components/Layout.jsx`) to conditionally render UI elements (e.g., menu items, buttons) based on the user's permissions.
- **Permissions**: Permissions are strings that follow a `resource:action` format (e.g., `user:create`, `order:view`). Wildcards are also supported:
  - `*`: Grants all permissions (super admin).
  - `resource:*`: Grants all actions for a specific resource (e.g., `user:*`).

## Menu and Feature Permissions

The following table details the required permissions for accessing each menu item and the features within them.

| Menu Path              | Feature/Page                 | Required Permissions (Any of)         | Notes                                             |
| ---------------------- | ---------------------------- | ------------------------------------- | ------------------------------------------------- |
| `/dashboard`           | Dashboard                    | `dashboard.view`                      | View the main dashboard.                          |
| `/orders`              | Orders                       | `order.view`, `order:*`               | View the list of all orders.                      |
| `/orders?tab=intake`   | Intake Queue                 | `intake.view`, `intake:*`             | View the order intake queue.                      |
| `/orders?tab=completed`| Completed Orders             | `order.view`                          | View completed orders.                            |
| `/orders/workflow`     | Order Workflow               | `order.view`, `order:*`               | View the order workflow guide.                    |
| `/orders/new`          | Create New Order             | `order.create`, `order:*`             | Access the form to create a new order.            |
| `/orders/:id`          | Edit Order                   | `order.view`, `order.update`, `order:*` | Access the form to edit an existing order.        |
| `/worklist`            | Worklist                     | `worklist.view`                       | View the modality worklist.                       |
| `/reports`             | Reports (PDF)                | `report.view`                         | View generated PDF reports.                       |
| `/studies`             | Study List                   | `study.view`, `study:*`               | View the list of studies.                         |
| `/upload`              | Upload DICOM                 | `studies.upload`, `study.*`, `*`      | Upload new DICOM studies.                         |
| `/patients`            | Patients                     | `patient.view`, `patient:*`           | View the list of patients.                        |
| `/patients/new`        | Create New Patient           | `patient.create`, `patient:*`         | Access the form to create a new patient.          |
| `/patients/:id`        | Edit Patient                 | `patient.view`, `patient.update`, `patient:*` | Access the form to edit an existing patient.      |
| `/doctors`             | Doctors                      | `doctor.view`, `doctor:*`             | View the list of doctors.                         |
| `/doctors/new`         | Create New Doctor            | `doctor.create`, `doctor:*`           | Access the form to create a new doctor.           |
| `/doctors/:id`         | Edit Doctor                  | `doctor.view`, `doctor.update`, `doctor:*` | Access the form to edit an existing doctor.       |
| `/procedures`          | Procedures                   | `procedure.view`, `procedure:*`       | View the list of procedures.                      |
| `/procedures/new`      | Create New Procedure         | `procedure.create`, `procedure:*`     | Access the form to create a new procedure.        |
| `/procedures/:id`      | Edit Procedure               | `procedure.view`, `procedure.update`, `procedure:*` | Access the form to edit an existing procedure.    |
| `/mappings`            | Procedure Mappings           | `mapping.view`, `mapping:*`           | View procedure mappings.                          |
| `/mappings/new`        | Create New Mapping           | `mapping.create`, `mapping:*`         | Access the form to create a new mapping.          |
| `/mappings/:id`        | Edit Mapping                 | `mapping.view`, `mapping.update`, `mapping:*` | Access the form to edit an existing mapping.      |
| `/external-systems-docs`| External Systems (Docs)      | `external_system:read`, `*`           | View documentation for external systems.          |
| `/modalities`          | Modalities                   | `modality.manage`, `modality.view`    | Manage modalities.                                |
| `/dicom-nodes`         | DICOM Nodes                  | `node.manage`, `node.view`            | Manage DICOM nodes.                               |
| `/users`               | Users                        | `user:manage`, `user:read`, `*`       | Manage users.                                     |
| `/roles`               | Roles                        | `user:manage`, `user:read`, `*`       | Manage roles.                                     |
| `/permissions`         | Permissions                  | `user:manage`, `user:read`, `*`       | Manage permissions.                               |
| `/audit-logs`          | Audit Logs                   | `audit.view`, `*`                     | View audit logs.                                  |
| `/auth-audit-logs`     | Auth Audit Logs              | `audit.view`, `*`                     | View authentication audit logs.                   |
| `/storage-management`  | Storage Management           | `storage.manage`, `*`                 | Manage storage settings.                          |
| `/settings`            | General Settings             | -                                     | No specific permission at route level.            |
| `/settings/reports`    | Report Settings              | `setting:write`, `*`                  | Manage report settings.                           |

## Tools Menu

The "Tools" menu and its items are dynamically added to the navigation for users with the `superadmin` or `developer` roles.

| Menu Path              | Feature/Page                 | Required Role                         |
| ---------------------- | ---------------------------- | ------------------------------------- |
| `/satusehat-monitor`   | SatuSehat Monitor            | `superadmin`, `developer`             |
| `/dicom-viewer`        | DICOM Viewer (Upload)        | `superadmin`, `developer`             |
| `/dicom-viewer-demo`   | DICOM Viewer Demo            | `superadmin`, `developer`             |
| `/dicom-uid-generator` | DICOM UID Generator          | `superadmin`, `developer`             |
| `/debug-storage`       | Debug Storage (Dev)          | `superadmin`, `developer` (`*` perm)  |

## Unprotected Routes

The following routes do not have `ProtectedRoute` and are accessible to all authenticated users. Internal components on these pages may have their own permission checks.

- `/settings`
- `/dicom-viewer`
- `/dicom-viewer-demo`
- `/dicom-uid-generator`
- `/debug-storage`

The following routes are public and do not require authentication:

- `/login`
- `/verify-signature`
- `/signature-test`
