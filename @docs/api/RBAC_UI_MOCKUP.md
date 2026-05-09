# RBAC Protected Permissions - UI Mockup

## Permission Modal - Create/Edit

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Permission                                    [×] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Name *                                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ rbac:manage                                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Format: category:action (e.g., user:read, order:create)    │
│                                                               │
│ Description                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Manage RBAC (high privilege)                            │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Category                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ system                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ─────────────────────────────────────────────────────────── │
│                                                               │
│ ☑ 🔒 Protected Permission                                   │
│   Only SUPERADMIN/DEVELOPER can modify this permission.     │
│   Regular admins cannot edit or delete it.                  │
│                                                               │
│ ☑ 👁️ Hidden from Tenant Admin                              │
│   This permission will not be visible to regular tenant     │
│   admins. Only SUPERADMIN/DEVELOPER can see it.            │
│                                                               │
│                                                               │
│                                    [Cancel]  [Create Permission] │
└─────────────────────────────────────────────────────────────┘
```

## Permissions Tab - List View

```
┌─────────────────────────────────────────────────────────────────────┐
│ All Permissions                                  [+ Create Permission] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Search permissions by name, description, or category...             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ rbac:manage 🔒 👁️                                    [✎] [🗑] │   │
│ │ Manage RBAC (high privilege)                                 │   │
│ │ Category: system                                             │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ setting:dev 🔒 👁️                                   [✎] [🗑] │   │
│ │ Manage developer settings                                    │   │
│ │ Category: system                                             │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ system:admin 🔒                                      [✎] [🗑] │   │
│ │ System administration                                        │   │
│ │ Category: system                                             │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ user:read                                           [✎] [🗑] │   │
│ │ Read user data                                               │   │
│ │ Category: user                                               │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ user:create                                         [✎] [🗑] │   │
│ │ Create new users                                             │   │
│ │ Category: user                                               │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Badge Meanings

### 🔒 Protected Badge
- **Meaning**: Only SUPERADMIN/DEVELOPER can modify
- **Color**: Amber/Yellow background
- **Hover**: Shows tooltip "Protected - Only SUPERADMIN/DEVELOPER can modify"
- **Effect**: Edit/Delete buttons hidden for regular admins

### 👁️ Hidden Badge
- **Meaning**: Not visible to regular tenant admins
- **Color**: Gray background
- **Hover**: Shows tooltip "Hidden from tenant admins"
- **Effect**: Permission not shown in list for regular admins

## Permission Card - For SUPERADMIN/DEVELOPER

```
┌──────────────────────────────────────────────────────────────┐
│ rbac:manage 🔒 👁️                                    [✎] [🗑] │
│ Manage RBAC (high privilege)                                 │
│ Category: system                                             │
└──────────────────────────────────────────────────────────────┘
```

- Badges terlihat: 🔒 👁️
- Buttons terlihat: Edit [✎] Delete [🗑]
- Dapat memodifikasi permission

## Permission Card - For Regular ADMIN

### Visible Protected Permission (not hidden)

```
┌──────────────────────────────────────────────────────────────┐
│ system:admin 🔒                                              │
│ System administration                                        │
│ Category: system                                             │
└──────────────────────────────────────────────────────────────┘
```

- Badge terlihat: 🔒
- Buttons tidak terlihat (disabled)
- Tidak dapat memodifikasi permission

### Hidden Permission (tidak terlihat sama sekali)

```
(Permission tidak ditampilkan di list)
```

- Permission tidak ada di list
- Tidak bisa dilihat atau dimodifikasi

## Roles Tab - Similar Pattern

```
┌──────────────────────────────────────────────────────────────┐
│ SUPERADMIN 🔒                                        [✎] [🗑] │
│ Super administrator with full access                         │
│ Status: Active                                               │
└──────────────────────────────────────────────────────────────┘
```

- Roles juga dapat di-mark sebagai protected
- Same badge dan button visibility logic

## Form Checkboxes - Detailed View

### Protected Permission Checkbox

```
☑ 🔒 Protected Permission
  Only SUPERADMIN/DEVELOPER can modify this permission.
  Regular admins cannot edit or delete it.
```

- Checkbox dengan lock icon
- Clear explanation
- Helpful text

### Hidden from Tenant Admin Checkbox

```
☑ 👁️ Hidden from Tenant Admin
  This permission will not be visible to regular tenant admins.
  Only SUPERADMIN/DEVELOPER can see it.
```

- Checkbox dengan eye icon
- Clear explanation
- Helpful text

## Color Scheme

- **Protected Badge**: Amber/Yellow (🔒)
  - Background: `bg-amber-100`
  - Text: `text-amber-800`
  - Border: `border-amber-300`

- **Hidden Badge**: Gray (👁️)
  - Background: `bg-gray-200`
  - Text: `text-gray-700`

- **Protected Card Border**: Amber left border
  - `border-l-4 border-l-amber-400`
  - Background: `bg-amber-50/30`

## Interaction Flow

### SUPERADMIN/DEVELOPER

1. Click "+ Create Permission"
2. Fill form
3. Check "🔒 Protected Permission"
4. Check "👁️ Hidden from Tenant Admin"
5. Click "Create Permission"
6. Permission created with both flags
7. Can edit/delete anytime

### Regular ADMIN

1. Click "+ Create Permission"
2. Fill form
3. Checkboxes untuk protected/hidden tidak terlihat atau disabled
4. Click "Create Permission"
5. Permission created without protected/hidden flags
6. Cannot edit/delete protected permissions
7. Cannot see hidden permissions

## Responsive Design

- **Desktop**: 3-column grid for permission cards
- **Tablet**: 2-column grid
- **Mobile**: 1-column stack

All badges and buttons remain visible and functional on all screen sizes.

