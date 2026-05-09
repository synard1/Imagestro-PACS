/**
 * PWA Icon Generation Script
 * 
 * This script should be run to generate all required PWA icons from the base SVG.
 * 
 * Requirements:
 * - Node.js with sharp package: npm install sharp
 * - Base SVG icon: base-icon.svg
 * 
 * Usage: node generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' }
];

async function generateIcons() {
  const svgPath = path.join(__dirname, 'base-icon.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('Base SVG icon not found:', svgPath);
    return;
  }

  console.log('Generating PWA icons...');

  for (const { size, name } of sizes) {
    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, name));
      
      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to generate ${name}:`, error.message);
    }
  }

  // Generate favicon
  try {
    await sharp(svgPath)
      .resize(32, 32)
      .png()
      .toFile(path.join(__dirname, '../favicon.png'));
    
    console.log('✓ Generated favicon.png (32x32)');
  } catch (error) {
    console.error('✗ Failed to generate favicon:', error.message);
  }

  // Generate apple touch icon
  try {
    await sharp(svgPath)
      .resize(180, 180)
      .png()
      .toFile(path.join(__dirname, '../apple-touch-icon.png'));
    
    console.log('✓ Generated apple-touch-icon.png (180x180)');
  } catch (error) {
    console.error('✗ Failed to generate apple touch icon:', error.message);
  }

  console.log('\nIcon generation complete!');
  console.log('Note: You may need to convert favicon.png to favicon.ico using an online converter.');
}

if (require.main === module) {
  generateIcons().catch(console.error);
}

module.exports = { generateIcons };