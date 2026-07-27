App Icon Generator - ConvertICO.com
=====================================

Generated icons for: iOS, Android, macOS, Web
Generated on: 27/07/2026

FOLDER STRUCTURE
================

iOS/
  - Contains all iOS app icon sizes
  - Add to your Xcode project's Assets.xcassets/AppIcon.appiconset/
  - Update Contents.json accordingly

Android/
  - mipmap-mdpi/ through mipmap-xxxhdpi/ folders
  - Copy folders directly to your app/src/main/res/ directory
  - playstore-icon.png (512x512) for Google Play Store
  - Adaptive icon assets (ic_launcher_foreground.png, ic_launcher_background.png)
  - values/colors.xml contains the background color


macOS/
  - Contains all macOS app icon sizes with @2x Retina variants
  - Add to your Xcode project's Assets.xcassets/AppIcon.appiconset/

Web/
  - favicon.ico - Multi-size favicon for browsers
  - PNG icons in various sizes for different uses
  - apple-touch-icon.png - For iOS Safari bookmarks
  - manifest.json - PWA manifest file
  - html-snippet.txt - HTML code to add to your page


USAGE TIPS
==========

iOS:
- Drag icons into Xcode's asset catalog
- Xcode will automatically use correct sizes

Android:
- Copy mipmap folders to res/ directory
- For adaptive icons, add to AndroidManifest.xml:
  android:icon="@mipmap/ic_launcher"
  android:roundIcon="@mipmap/ic_launcher_round"

Web:
- Place files in your website's root directory
- Add HTML snippet to your <head> section

---
Generated with ConvertICO.com App Icon Generator
https://convertico.com/app-icon-generator/
