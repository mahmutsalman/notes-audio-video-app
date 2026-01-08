# Media Assets

This directory contains all media assets for the project documentation, including screenshots and demo GIFs.

## 📁 Directory Structure

```
.github/media/
├── README.md                    # This file - Guidelines for media assets
├── demos/                       # Demo GIFs and recordings
│   ├── .gitkeep
│   └── DEMO_TEMPLATE.md         # Recording tips and guidelines
└── screenshots/                 # Static screenshots
    └── *.png                    # Screenshot files
```

## 🎯 Purpose

This directory serves as the centralized location for all visual media assets used in:
- README.md documentation
- GitHub wiki pages
- Issue templates and discussions
- Pull request descriptions

## 📸 Screenshot Guidelines

### Resolution & Quality
- **Recommended Resolution**: 1280x720 (HD) or 1920x1080 (Full HD)
- **Format**: PNG for screenshots (lossless quality)
- **File Size**: Keep under 2MB per screenshot
- **Retina/2x Images**: Use `@2x` suffix for high-DPI screenshots

### Naming Conventions
Use lowercase with hyphens, descriptive names:
- ✅ `audio-recording-interface.png`
- ✅ `video-recording-note.png`
- ✅ `topic-list-view.png`
- ❌ `Screen Shot 2024-01-08.png`
- ❌ `IMG_1234.png`

### What to Capture
- Clean UI without personal data
- Representative use cases
- Key features and workflows
- Before/after comparisons
- Error states and edge cases

## 🎬 Demo GIF Guidelines

### Recording Specifications
- **Duration**: 5-15 seconds optimal
- **Resolution**: 1280x720 or 1920x1080
- **Frame Rate**: 10-15 fps (sufficient for UI demos)
- **File Size**: Keep under 5MB
- **Format**: GIF or MP4 (GIF for inline, MP4 for size)

### Recording Best Practices
1. **Plan the workflow** - Script the actions before recording
2. **Clean state** - Start with a clean, focused UI
3. **Smooth interactions** - Slow down mouse movements
4. **Highlight actions** - Use cursor highlighting tools
5. **Loop seamlessly** - Start and end in similar states

### Conversion Tools
- **macOS**: QuickTime Player + ffmpeg
- **Windows**: ScreenToGif, LICEcap
- **Cross-platform**: OBS Studio, ffmpeg
- **Online**: ezgif.com, cloudconvert.com

See `demos/DEMO_TEMPLATE.md` for detailed recording instructions.

## 🔗 Usage in README

### Screenshots
```markdown
<div align="center">
  <img src=".github/media/screenshots/feature-name.png" alt="Feature Description" width="800"/>
  <p><em>Caption explaining what this shows</em></p>
</div>
```

### Demo GIFs
```markdown
<div align="center">

![Feature Demo](.github/media/demos/feature-demo.gif)

*Description of the workflow shown*

</div>
```

## 🎨 Tips for Great Screenshots

1. **Consistency** - Use the same theme/appearance across screenshots
2. **Context** - Show enough UI to understand the context
3. **Focus** - Highlight the relevant area, crop unnecessary space
4. **Annotations** - Add arrows or highlights for clarity (optional)
5. **Currency** - Update screenshots when UI changes significantly

## 📦 File Size Optimization

### PNG Screenshots
```bash
# Using pngquant (lossy compression)
pngquant --quality=65-80 screenshot.png -o screenshot-optimized.png

# Using optipng (lossless compression)
optipng -o7 screenshot.png
```

### GIF Demos
```bash
# Using ffmpeg to create optimized GIF
ffmpeg -i input.mp4 -vf "fps=10,scale=1280:-1:flags=lanczos" -c:v pam -f image2pipe - | \
convert -delay 10 - -loop 0 -layers optimize output.gif

# Using gifsicle to optimize existing GIF
gifsicle -O3 --lossy=80 input.gif -o output.gif
```

## 🔄 Updating Media Assets

When updating screenshots or demos:
1. Keep old filename if replacing content
2. Update all references in documentation
3. Commit with descriptive message: `docs: update [feature] screenshot`
4. Consider backward compatibility for external links

## 📋 Checklist for New Assets

- [ ] File size optimized (PNG < 2MB, GIF < 5MB)
- [ ] Descriptive filename using kebab-case
- [ ] No personal or sensitive information visible
- [ ] High quality and representative of current version
- [ ] Referenced in README or documentation
- [ ] Committed with proper message

## 🙏 Contributing

When contributing media assets:
- Follow naming conventions
- Optimize file sizes
- Provide context in PR description
- Update this README if adding new categories
- Ensure screenshots reflect latest UI version

---

**Questions?** Open an issue or discussion if you need help with media assets.
