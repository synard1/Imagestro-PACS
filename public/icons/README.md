# PWA Icons

This directory contains all the PWA icons and assets for the MWL PACS UI application.

## Icon Sizes

The following icon sizes are generated for comprehensive PWA support:

- **72x72**: Android Chrome (older versions)
- **96x96**: Android Chrome
- **128x128**: Chrome Web Store
- **144x144**: Windows Metro tile
- **152x152**: iOS Safari
- **192x192**: Android Chrome (standard)
- **384x384**: Android Chrome (high-res)
- **512x512**: Android Chrome (highest-res)

## Additional Assets

- **favicon.ico**: Browser tab icon (32x32)
- **apple-touch-icon.png**: iOS home screen icon (180x180)
- **masked-icon.svg**: Safari pinned tab icon

## Generation Process

1. **Install dependencies**:
   ```bash
   npm install sharp
   ```

2. **Generate icons from SVG**:
   ```bash
   node generate-icons.js
   ```

3. **Convert favicon** (if needed):
   - Use an online converter to create favicon.ico from favicon.png
   - Or use ImageMagick: `convert favicon.png favicon.ico`

## Design Guidelines

The base icon follows these principles:
- **Medical theme**: Features a medical cross symbol
- **Brand colors**: Uses the app's primary blue theme (#3b82f6)
- **Clear visibility**: High contrast white symbols on blue background
- **Professional**: Clean, modern design suitable for medical applications
- **Scalable**: SVG-based design that scales well to all sizes

## Customization

To customize the icons:
1. Edit `base-icon.svg` with your preferred design
2. Run the generation script to create all sizes
3. Test the icons in different contexts (home screen, app drawer, etc.)

## Browser Support

These icons provide comprehensive support for:
- Chrome (Android/Desktop)
- Safari (iOS/macOS)
- Firefox
- Edge
- Samsung Internet
- Other PWA-compatible browsers