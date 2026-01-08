# Demo Recording Guide

Comprehensive guide for creating professional demo GIFs and recordings for the project documentation.

## 🎥 Recording Screen Demos

### macOS

#### Method 1: QuickTime Player + ffmpeg (Recommended)
```bash
# 1. Record with QuickTime Player
# File → New Screen Recording → Record selected portion

# 2. Convert to GIF using ffmpeg
ffmpeg -i recording.mov \
  -vf "fps=10,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 output.gif

# 3. Optimize the GIF
gifsicle -O3 --lossy=80 output.gif -o optimized.gif
```

#### Method 2: Screenshot.app (macOS Sonoma+)
```bash
# Press Cmd+Shift+5 → Choose "Record Selected Portion"
# Click Options → Set save location to Desktop
# Record and stop when done
```

### Windows

#### Using ScreenToGif (Free)
1. Download from [screentogif.com](https://www.screentogif.com/)
2. Launch → Screen Recorder
3. Position the recording frame
4. Click Record → Perform actions → Stop
5. Edit → File → Save as GIF

#### Using Windows Game Bar
```bash
# Press Win+G → Click Capture → Record
# Trim and export using Video Editor
# Convert to GIF using online tool or ffmpeg
```

### Linux

#### Using Peek (Recommended)
```bash
# Install Peek
sudo apt install peek  # Debian/Ubuntu
sudo dnf install peek  # Fedora

# Launch and record
peek
```

#### Using ffmpeg + slop
```bash
# Get screen region
slop=$(slop -f "%x %y %w %h %g %i") || exit 1
read -r X Y W H G ID <<< $slop

# Record with ffmpeg
ffmpeg -f x11grab -s "$W"x"$H" -i :0.0+$X,$Y -t 10 output.mp4

# Convert to GIF
ffmpeg -i output.mp4 -vf "fps=10,scale=1280:-1:flags=lanczos" output.gif
```

## 🎨 Recording Best Practices

### Before Recording

- [ ] **Clean your UI** - Close unnecessary windows, notifications
- [ ] **Reset application state** - Start from a clean slate
- [ ] **Prepare test data** - Have realistic sample content ready
- [ ] **Script the workflow** - Know exactly what to demonstrate
- [ ] **Test the workflow** - Practice the actions 2-3 times
- [ ] **Check resolution** - Ensure recording area is HD (1280x720 or 1920x1080)

### During Recording

- [ ] **Slow down** - Move cursor 50% slower than normal
- [ ] **Pause between actions** - Give 0.5-1s between clicks
- [ ] **Highlight important actions** - Use cursor highlighting tools
- [ ] **Avoid mistakes** - It's okay to re-record
- [ ] **Keep it focused** - Show one feature/workflow per demo
- [ ] **Make it loopable** - End in a state similar to the start

### After Recording

- [ ] **Review the recording** - Watch it fully before processing
- [ ] **Trim dead time** - Remove delays at start/end
- [ ] **Optimize file size** - Compress to under 5MB
- [ ] **Test the loop** - Ensure it loops smoothly
- [ ] **Add to README** - Update documentation with proper context

## 🔄 Converting Video to GIF

### Using ffmpeg (High Quality)

```bash
# Generate palette for better color quality
ffmpeg -i input.mp4 -vf "fps=10,scale=1280:-1:flags=lanczos,palettegen" palette.png

# Create GIF using the palette
ffmpeg -i input.mp4 -i palette.png \
  -filter_complex "fps=10,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse" \
  -loop 0 output.gif

# One-liner version
ffmpeg -i input.mp4 \
  -vf "fps=10,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 output.gif
```

### Using Online Tools

1. **[ezgif.com](https://ezgif.com/video-to-gif)**
   - Upload video → Convert to GIF
   - Adjust frame rate (10-15 fps)
   - Optimize with lossy compression
   - Download result

2. **[cloudconvert.com](https://cloudconvert.com/)**
   - Supports batch conversion
   - More format options
   - Higher quality output

## 📐 Resolution & Quality Settings

### Recommended Settings

| Platform | Resolution | FPS | Max Size | Duration |
|----------|-----------|-----|----------|----------|
| GitHub README | 1280x720 | 10-15 | 5MB | 5-15s |
| Detailed Tutorial | 1920x1080 | 15 | 10MB | 10-30s |
| Quick Demo | 800x600 | 10 | 2MB | 3-8s |

### Quality vs Size Trade-offs

```bash
# High Quality (larger file)
ffmpeg -i input.mp4 -vf "fps=15,scale=1920:-1:flags=lanczos" output.gif

# Balanced (recommended)
ffmpeg -i input.mp4 -vf "fps=10,scale=1280:-1:flags=lanczos" output.gif

# Smaller Size (lower quality)
ffmpeg -i input.mp4 -vf "fps=8,scale=800:-1:flags=lanczos" output.gif
```

## 🛠 Optimization Tools

### GIF Optimization

```bash
# Using gifsicle (best compression)
gifsicle -O3 --lossy=80 --colors 256 input.gif -o output.gif

# Using ImageMagick
convert input.gif -fuzz 10% -layers Optimize output.gif

# Reduce colors for smaller size
convert input.gif -colors 128 -fuzz 10% -layers Optimize output.gif
```

### Checking File Size

```bash
# Linux/macOS
ls -lh output.gif

# Get size in KB
du -h output.gif

# If too large, increase lossy compression
gifsicle -O3 --lossy=100 --colors 128 input.gif -o output.gif
```

## 📝 Demo Naming Conventions

Use descriptive, kebab-case names:

### Feature Demos
- `audio-recording-demo.gif` - Recording audio notes
- `video-recording-demo.gif` - Recording video notes
- `topic-management-demo.gif` - Managing topics
- `playback-controls-demo.gif` - Audio/video playback

### Workflow Demos
- `create-note-workflow.gif` - Complete note creation flow
- `search-and-filter-demo.gif` - Searching and filtering notes
- `export-notes-demo.gif` - Exporting notes workflow

### Integration Demos
- `obsidian-integration-demo.gif` - Using with Obsidian
- `import-export-demo.gif` - Import/export features

## 📋 Demo Checklist

Before committing a new demo:

- [ ] File size < 5MB
- [ ] Resolution is 1280x720 or higher
- [ ] Frame rate is 10-15 fps
- [ ] Duration is 5-15 seconds
- [ ] Loops smoothly without jarring transitions
- [ ] No personal or sensitive information visible
- [ ] Filename follows kebab-case convention
- [ ] Added to README with proper context
- [ ] Compressed and optimized

## 🎯 Demo Categories

### Essential Demos (High Priority)
- Main feature demonstrations
- Core workflows
- Getting started guide

### Feature Showcases
- Individual feature highlights
- Advanced functionality
- Tips and tricks

### Technical Demos
- Developer features
- API usage
- Plugin development

## 💡 Tips for Engaging Demos

1. **Show the result first** - Let viewers see what they'll learn
2. **Use real data** - Realistic examples are more relatable
3. **Keep it short** - 10 seconds is optimal, 15 is maximum
4. **Focus on one thing** - Don't try to show everything
5. **Make it loopable** - Smooth transitions keep viewers engaged
6. **Add context in README** - Explain what the demo shows

## 📚 Example Usage in README

```markdown
## 🎬 See It in Action

<div align="center">

### Audio Recording
![Audio Recording Demo](.github/media/demos/audio-recording-demo.gif)

*Record audio notes with real-time waveform visualization*

---

### Video Recording
![Video Recording Demo](.github/media/demos/video-recording-demo.gif)

*Capture screen recordings with synchronized note-taking*

</div>
```

## 🔧 Troubleshooting

### GIF is too large (> 5MB)
1. Reduce frame rate: `fps=8` instead of `fps=10`
2. Reduce resolution: `scale=800:-1` instead of `scale=1280:-1`
3. Increase lossy compression: `--lossy=100` instead of `--lossy=80`
4. Reduce colors: `--colors 128` instead of `--colors 256`
5. Trim duration: Keep under 10 seconds

### GIF quality is poor
1. Increase resolution in original recording
2. Use palette-based conversion (see ffmpeg examples)
3. Increase colors: `--colors 256`
4. Reduce lossy compression: `--lossy=60`

### GIF doesn't loop smoothly
1. Ensure last frame is similar to first frame
2. Record a circular workflow
3. Add a brief pause at the end: `-t <duration+0.5>`

---

**Need help?** Open an issue if you have questions about creating demos.
