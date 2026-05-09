# Profile Management Feature

## Overview

The Profile Management feature allows users to view and update their personal information, change passwords, and manage account settings.

## Features

### 1. Profile Information
- View and edit personal details:
  - Full Name
  - Email Address
  - Phone Number
  - Specialization (for medical professionals)
  - License Number
- Real-time validation
- Auto-save functionality

### 2. Security Settings
- Change password with validation:
  - Current password verification
  - Minimum 8 characters requirement
  - Password confirmation
  - Different from current password check
- Secure password change flow

### 3. User Activity (Future Enhancement)
- View recent account activity
- Track login history
- Monitor profile changes

## User Interface

### Profile Page Layout

```
┌─────────────────────────────────────────────┐
│  My Profile                          [Back] │
├─────────────────────────────────────────────┤
│  ┌───┐                                      │
│  │ U │  User Name                           │
│  └───┘  user@example.com                    │
│         [ROLE]                               │
├─────────────────────────────────────────────┤
│  [Profile Information] [Security]           │
├─────────────────────────────────────────────┤
│  Profile Information Tab:                   │
│  ┌─────────────────┬─────────────────┐     │
│  │ Full Name *     │ Email Address * │     │
│  ├─────────────────┼─────────────────┤     │
│  │ Phone Number    │ Specialization  │     │
│  ├─────────────────┴─────────────────┤     │
│  │ License Number                    │     │
│  └───────────────────────────────────┘     │
│                      [Save Changes]         │
└─────────────────────────────────────────────┘
```

### Security Tab

```
┌─────────────────────────────────────────────┐
│  Change Password                            │
├─────────────────────────────────────────────┤
│  Current Password *                         │
│  ┌───────────────────────────────────┐     │
│  │ ••••••••••••                      │     │
│  └───────────────────────────────────┘     │
│                                             │
│  New Password *                             │
│  ┌───────────────────────────────────┐     │
│  │ ••••••••••••                      │     │
│  └───────────────────────────────────┘     │
│                                             │
│  Confirm New Password *                     │
│  ┌───────────────────────────────────┐     │
│  │ ••••••••••••                      │     │
│  └───────────────────────────────────┘     │
│                                             │
│  Password Requirements:                     │
│  • Minimum 8 characters                     │
│  • Different from current password          │
│  • Mix of letters, numbers, symbols         │
│                                             │
│                   [Change Password]         │
└─────────────────────────────────────────────┘
```

## Access Control

### Permissions
- All authenticated users can access their own profile
- No special permissions required
- Users can only edit their own profile

### Route
- Path: `/profile`
- Protected: Yes (requires authentication)
- Layout: Standard application layout

## API Integration

### Backend Endpoints Used

1. **Get User Profile**
   - Endpoint: `GET /auth/users/{userId}`
   - Module: `users`
   - Fallback: localStorage data

2. **Update Profile**
   - Endpoint: `PUT /auth/users/{userId}`
   - Module: `users`
   - Fallback: localStorage update

3. **Change Password**
   - Endpoint: `POST /auth/users/{userId}/change-password`
   - Module: `users`
   - Requires: Backend authentication

4. **Verify Password**
   - Endpoint: `POST /login` (verification only)
   - Module: `auth`
   - Used for: Current password validation

## Service Layer

### profileService.js

```javascript
// Get current user's profile
getProfile()

// Update profile information
updateProfile(profileData)

// Change password
changePassword(currentPassword, newPassword)

// Upload profile picture (future)
uploadProfilePicture(file)

// Delete profile picture (future)
deleteProfilePicture()

// Get user activity log (future)
getUserActivity(params)
```

## Validation Rules

### Profile Information
- **Full Name**: Required, min 2 characters
- **Email**: Required, valid email format
- **Phone**: Optional, valid phone format
- **Specialization**: Optional, text
- **License Number**: Optional, alphanumeric

### Password Change
- **Current Password**: Required
- **New Password**: 
  - Required
  - Minimum 8 characters
  - Must be different from current password
- **Confirm Password**: 
  - Required
  - Must match new password

## Error Handling

### Common Errors

1. **Authentication Errors**
   - No user logged in
   - Session expired
   - Invalid token

2. **Validation Errors**
   - Missing required fields
   - Invalid email format
   - Password too short
   - Passwords don't match

3. **Backend Errors**
   - Network failure
   - Server error
   - Permission denied

### Error Messages

```javascript
// Authentication
"No authenticated user found"
"Session expired, please login again"

// Validation
"Full name is required"
"Please enter a valid email address"
"Password must be at least 8 characters"
"Passwords do not match"
"New password must be different from current password"

// Backend
"Failed to update profile: [error message]"
"Current password is incorrect"
"Failed to change password: [error message]"
```

## User Experience

### Success Feedback
- Toast notification on successful save
- Form fields remain editable
- No page reload required

### Loading States
- "Saving..." button text during save
- Disabled buttons during operations
- Loading spinner for async operations

### Responsive Design
- Mobile-friendly layout
- Touch-optimized inputs
- Adaptive grid for form fields

## Future Enhancements

### Planned Features

1. **Profile Picture**
   - Upload profile photo
   - Crop and resize
   - Delete photo

2. **Activity Log**
   - Recent login history
   - Profile change history
   - Security events

3. **Preferences**
   - Language selection
   - Timezone settings
   - Notification preferences

4. **Two-Factor Authentication**
   - Enable/disable 2FA
   - QR code setup
   - Backup codes

5. **Session Management**
   - View active sessions
   - Revoke sessions
   - Device management

## Testing

### Manual Testing Checklist

- [ ] View profile information
- [ ] Edit profile fields
- [ ] Save profile changes
- [ ] Validate required fields
- [ ] Change password successfully
- [ ] Verify current password validation
- [ ] Test password mismatch error
- [ ] Test password length validation
- [ ] Test backend offline fallback
- [ ] Test mobile responsive layout

### Test Scenarios

1. **Profile Update**
   ```
   Given: User is logged in
   When: User updates name and email
   Then: Profile is saved successfully
   And: Toast notification is shown
   And: User data is updated in localStorage
   ```

2. **Password Change**
   ```
   Given: User is on security tab
   When: User enters valid passwords
   Then: Password is changed successfully
   And: Form is cleared
   And: Success message is shown
   ```

3. **Validation Error**
   ```
   Given: User is changing password
   When: New password is too short
   Then: Error message is displayed
   And: Form is not submitted
   ```

## Integration Points

### Components Used
- `useAuth` hook - Get current user
- `useToast` hook - Show notifications
- `userService` - API calls
- `authService` - Password verification
- `ToastProvider` - Toast notifications

### Navigation
- Accessible from: Header user menu
- Back button: Returns to previous page
- Settings link: Available in header

## Security Considerations

1. **Password Verification**
   - Current password must be verified before change
   - Passwords never stored in plain text
   - Secure transmission over HTTPS

2. **Data Privacy**
   - Users can only access their own profile
   - No exposure of sensitive data
   - Audit log for profile changes

3. **Session Management**
   - Profile updates don't invalidate session
   - Password change requires re-authentication
   - Token refresh on profile update

## Troubleshooting

### Common Issues

1. **Profile not loading**
   - Check authentication status
   - Verify backend connectivity
   - Check browser console for errors

2. **Save fails**
   - Verify required fields
   - Check network connection
   - Verify backend module enabled

3. **Password change fails**
   - Verify current password
   - Check password requirements
   - Ensure backend auth is enabled

## Configuration

### Environment Variables
```env
# No specific env vars required
# Uses existing backend configuration
```

### Backend Module Requirements
- `users` module: For profile updates
- `auth` module: For password changes
- `audit` module: For activity log (optional)

## Code Examples

### Using Profile Service

```javascript
import { getProfile, updateProfile, changePassword } from '../services/profileService';

// Get current user profile
const profile = await getProfile();

// Update profile
await updateProfile({
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1234567890'
});

// Change password
await changePassword('currentPass123', 'newPass456');
```

### Using in Component

```javascript
import { useState } from 'react';
import { updateUser } from '../services/userService';
import { useAuth } from '../hooks/useAuth';

function ProfileForm() {
  const { currentUser } = useAuth();
  const [name, setName] = useState(currentUser?.name || '');
  
  const handleSave = async () => {
    await updateUser(currentUser.id, { name });
  };
  
  return (
    <form onSubmit={handleSave}>
      <input value={name} onChange={e => setName(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Support

For issues or questions:
1. Check this documentation
2. Review browser console for errors
3. Verify backend configuration
4. Contact system administrator
