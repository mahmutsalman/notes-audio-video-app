# Contributing to Notes With Audio And Video

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:
- Be respectful and constructive in communication
- Welcome newcomers and help them get started
- Focus on what is best for the project and community
- Show empathy towards other community members

## Ways to Contribute

There are many ways to contribute to Notes With Audio And Video:

### 🐛 Reporting Bugs

Found a bug? Please help us fix it:

1. **Check existing issues** to avoid duplicates
2. **Create a new issue** with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected behavior vs. actual behavior
   - Screenshots if applicable
   - Your environment (OS, version, etc.)
   - Error messages or logs

### 💡 Suggesting Features

Have an idea for a new feature?

1. **Check existing issues** to see if it's already suggested
2. **Open a feature request** with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach
   - Any alternatives you've considered

### 📝 Improving Documentation

Documentation improvements are always welcome:
- Fix typos or clarify unclear sections
- Add examples or tutorials
- Improve API documentation
- Translate documentation (future)

### 🔧 Contributing Code

Ready to write code? Great! Please follow the process below.

## Development Setup

### Prerequisites

- **Node.js**: v20 or higher
- **npm**: Latest version
- **Python**: v3.x (for native module builds)
- **Git**: Latest version

**Platform-Specific Requirements:**

- **macOS**: Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```

- **Windows**: Visual Studio Build Tools
  - Download from: https://visualstudio.microsoft.com/downloads/
  - Install "Desktop development with C++" workload

- **Linux**: Build essentials
  ```bash
  sudo apt-get install build-essential
  ```

### Initial Setup

1. **Fork the repository**
   - Click "Fork" button on GitHub
   - Clone your fork locally:
     ```bash
     git clone https://github.com/YOUR-USERNAME/notes-with-audio-and-video.git
     cd notes-with-audio-and-video
     ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/mahmutsalman/notes-with-audio-and-video.git
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Rebuild native modules**
   ```bash
   npm run rebuild
   ```

5. **Run in development mode**
   ```bash
   npm run electron:dev
   ```

### Project Structure

```
notes-with-audio-and-video/
├── electron/              # Electron main process
│   ├── main.ts           # Entry point
│   ├── preload.ts        # Preload script
│   └── native/           # Native C++ modules
│       └── screencapturekit/
├── src/                  # React frontend
│   ├── components/       # React components
│   ├── services/         # Business logic
│   │   └── database.ts   # SQLite operations
│   ├── types/            # TypeScript types
│   ├── App.tsx           # Root component
│   └── main.tsx          # React entry point
├── build/                # Build resources
│   └── entitlements.*.plist
├── public/               # Static assets
└── docs/                 # Documentation
```

## Pull Request Process

### 1. Create a Branch

Always create a new branch for your changes:

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/bug-description
```

**Branch Naming Convention:**
- Features: `feature/description`
- Bug fixes: `fix/description`
- Documentation: `docs/description`
- Refactoring: `refactor/description`

### 2. Make Your Changes

- Write clear, readable code
- Follow existing code style
- Add comments for complex logic
- Keep commits focused and atomic
- Write meaningful commit messages

**Commit Message Format:**
```
type: Brief description (50 chars or less)

More detailed explanation if needed (wrap at 72 chars).
Explain what and why, not how.

Fixes #123
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Example:**
```
feat: add playback speed control to audio player

Implements adjustable playback speed from 0.5x to 2x.
Users can now control audio playback speed using a slider
in the audio control panel.

Fixes #42
```

### 3. Test Your Changes

Before submitting:

- [ ] Code runs without errors
- [ ] Existing functionality still works
- [ ] New features work as expected
- [ ] No console errors or warnings
- [ ] Code follows project style

**Manual Testing:**
```bash
# Run development build
npm run electron:dev

# Test the specific feature
# Test related features
# Test on target platforms if possible
```

### 4. Update Documentation

If your changes affect:
- Public APIs → Update API documentation
- User features → Update README.md
- Setup process → Update this file

### 5. Submit Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Reference related issues (`Fixes #123`)
   - Describe what changed and why
   - Add screenshots for UI changes
   - Fill out the PR template

3. **PR Template:**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Related Issues
   Fixes #(issue number)

   ## Testing
   Describe how you tested these changes

   ## Screenshots (if applicable)
   Add screenshots for UI changes

   ## Checklist
   - [ ] Code follows project style
   - [ ] Self-review completed
   - [ ] Commented complex code
   - [ ] Documentation updated
   - [ ] No new warnings
   - [ ] Tested on relevant platforms
   ```

### 6. Code Review Process

After submitting your PR:

1. **Automated Checks**: CI will run automated tests
2. **Code Review**: Maintainer will review your code
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, PR will be merged

**Response Times:**
- Initial review: Within 5 business days
- Follow-up reviews: Within 2 business days

## Coding Guidelines

### TypeScript Style

```typescript
// Use PascalCase for components and classes
class AudioRecorder { }
const PlayerComponent: React.FC = () => { };

// Use camelCase for functions and variables
const getUserData = () => { };
let isRecording = false;

// Use UPPER_SNAKE_CASE for constants
const MAX_RECORDING_DURATION = 3600;

// Prefer const over let
const items = [];

// Use meaningful names
// Good
const activeRecordingSession = null;
// Bad
const ars = null;

// Add types explicitly
function processAudio(data: AudioBuffer): ProcessedAudio {
  // ...
}
```

### React Best Practices

```typescript
// Use functional components with hooks
import React, { useState, useEffect } from 'react';

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioId }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Cleanup
    return () => {
      // cleanup code
    };
  }, [audioId]);

  return (
    <div className="audio-player">
      {/* JSX */}
    </div>
  );
};
```

### File Organization

- One component per file
- Name file same as component
- Group related files in folders
- Keep files under 300 lines

### Comments

```typescript
// Good: Explain WHY, not WHAT
// Use setTimeout to prevent blocking the UI thread during heavy processing
setTimeout(() => processLargeFile(), 0);

// Bad: Obvious comment
// Set isPlaying to true
setIsPlaying(true);

// Good: Document complex algorithms
/**
 * Calculates optimal buffer size based on sample rate and channel count.
 * Uses a logarithmic scale to balance memory usage with playback smoothness.
 *
 * @param sampleRate - Audio sample rate in Hz
 * @param channels - Number of audio channels
 * @returns Optimal buffer size in samples
 */
function calculateBufferSize(sampleRate: number, channels: number): number {
  // Implementation
}
```

## Database Changes

When modifying the SQLite schema:

1. Create migration scripts (currently manual)
2. Update TypeScript interfaces
3. Document schema changes
4. Test with existing data
5. Consider backwards compatibility

## Native Module Changes

For changes to native C++ modules:

1. Test on the target platform (currently macOS only)
2. Ensure memory management is correct
3. Document N-API interfaces
4. Update bindings if needed

## Security Considerations

- Never commit secrets or credentials
- Validate all user input
- Sanitize data before database operations
- Report security issues privately (see [SECURITY.md](SECURITY.md))

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers this project.

## Getting Help

Need help? Here's how to get assistance:

- **Questions**: Open a GitHub Discussion
- **Bugs**: Create an issue with the bug template
- **Security**: Email csmahmutsalman@gmail.com
- **Chat**: (Not yet available)

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes (for significant contributions)
- README.md (for major features)

## Thank You!

Every contribution, no matter how small, helps make Notes With Audio And Video better. We appreciate your time and effort!

---

**Maintainer**: Mahmut Salman ([@mahmutsalman](https://github.com/mahmutsalman))
**Last Updated**: December 31, 2025
