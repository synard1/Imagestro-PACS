# PWA Configuration Guide

This document outlines the Progressive Web App (PWA) configuration for the MWL PACS UI application.

## Files Overview

### Core PWA Files
- `manifest.json` - PWA manifest with app metadata
- `sw.js` - Service worker for offline functionality
- `browserconfig.xml` - Windows-specific PWA configuration

### Icons and Assets
- `icons/` - All PWA icons in various sizes
- `screenshots/` - App screenshots for PWA stores
- `favicon.ico` - Browser tab icon
- `apple-touch-icon.png` - iOS home screen icon
- `masked-icon.svg` - Safari pinned tab icon

## Manifest Configuration

The `manifest.json` includes:

### Basic Information
- **Name**: "MWL PACS UI - Medical Worklist and PACS Interface"
- **Short Name**: "PACS UI"
- **Description**: Medical application description
- **Start URL**: "/" (app root)
- **Scope**: "/" (entire app)

### Display Settings
- **Display Mode**: "standalone" (app-like experience)
- **Orientation**: "any" (supports all orientations)
- **Theme Color**: "#3b82f6" (primary blue)
- **Background Color**: "#f8fafc" (light gray)

### Icons
Complete icon set from 72x72 to 512x512 pixels:
- Standard icons for various platforms
- Maskable icons for Android adaptive icons
- Proper purpose attributes for optimal display

### Advanced Features
- **Screenshots**: Desktop and mobile screenshots for app stores
- **Categories**: Medical, healthcare, productivity, utilities
- **Launch Handler**: Focus existing window when launched
- **Edge Side Panel**: Optimized width for Microsoft Edge

## HTML Meta Tags

The `index.html` includes comprehensive PWA meta tags:

### Theme Colors
- Light mode: #3b82f6
- Dark mode: #1e40af (darker blue)
- Responsive to user's color scheme preference

### iOS Specific
- `apple-mobile-web-app-capable`: Enables full-screen mode
- `apple-mobile-web-app-status-bar-style`: Status bar appearance
- `apple-mobile-web-app-title`: App name on iOS home screen
- `apple-touch-fullscreen`: Full-screen support

### Windows Specific
- `msapplication-TileColor`: Windows tile background color
- `msapplication-config`: References browserconfig.xml
- `msapplication-tap-highlight`: Disables tap highlight

### General PWA
- `mobile-web-app-capable`: Enables PWA features
- `application-name`: App name for browsers
- `format-detection`: Disables automatic phone number detection
- `HandheldFriendly`: Mobile optimization indicator

## Browser Support

This PWA configuration supports:

### Full PWA Support
- Chrome 67+ (Android/Desktop)
- Edge 79+ (Windows/macOS)
- Safari 11.1+ (iOS/macOS)
- Firefox 58+ (Android/Desktop)
- Samsung Internet 7.2+

### Graceful Degradation
- Internet Explorer 11 (basic functionality)
- Older mobile browsers (standard web app)

## Installation Experience

### Android Chrome
- Install banner appears automatically
- "Add to Home Screen" option in menu
- Full-screen app experience
- App drawer integration

### iOS Safari
- "Add to Home Screen" from share menu
- Home screen icon with custom name
- Status bar integration
- Full-screen mode support

### Desktop Browsers
- Install prompt in address bar
- App-like window experience
- System integration (taskbar, dock)
- Offline functionality

## Testing PWA Features

### Lighthouse Audit
Run Lighthouse PWA audit to verify:
- Manifest validation
- Service worker functionality
- Icon requirements
- Installability criteria

### Manual Testing
1. **Installation**: Test install prompts on different devices
2. **Icons**: Verify icons appear correctly in all contexts
3. **Offline**: Test offline functionality with service worker
4. **Responsive**: Check app works on various screen sizes
5. **Performance**: Ensure fast loading and smooth interactions

### Browser DevTools
- Chrome: Application tab → Manifest/Service Workers
- Firefox: Application tab → Manifest
- Safari: Develop menu → Service Workers

## Deployment Checklist

Before deploying PWA updates:

- [ ] All icon files are actual images (not placeholders)
- [ ] Screenshots are captured and properly sized
- [ ] Manifest.json validates without errors
- [ ] Service worker is properly configured
- [ ] HTTPS is enabled (required for PWA)
- [ ] All meta tags are present in HTML
- [ ] Lighthouse PWA score is 90+

## Troubleshooting

### Common Issues

**Install prompt not showing**:
- Check HTTPS requirement
- Verify service worker registration
- Ensure manifest is valid
- Check browser compatibility

**Icons not displaying**:
- Verify icon file paths in manifest
- Check file formats (PNG required)
- Ensure proper sizes are available
- Test icon generation script

**Offline functionality not working**:
- Check service worker registration
- Verify cache strategies
- Test network conditions
- Review browser console for errors

### Debug Tools
- Chrome DevTools → Application → Manifest
- Chrome DevTools → Application → Service Workers
- Lighthouse PWA audit
- PWA Builder validation tools

## Future Enhancements

Potential PWA improvements:
- Push notifications for critical alerts
- Background sync for offline data
- File handling for DICOM files
- Share target for medical images
- Shortcuts for common actions
- Periodic background sync