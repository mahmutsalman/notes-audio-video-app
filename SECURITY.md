# Security Policy

## Supported Versions

We release updates regularly to improve security and functionality. Security updates are provided for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

We recommend always using the latest version available from our [Releases page](https://github.com/mahmutsalman/notes-with-audio-and-video/releases).

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in Notes With Audio And Video, please report it responsibly.

### How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of these methods:

1. **Email**: Send details to **csmahmutsalman@gmail.com**
   - Subject line: `[SECURITY] Vulnerability Report`
   - Include detailed description of the vulnerability
   - Include steps to reproduce
   - Include potential impact assessment

2. **GitHub Security Advisories**: Use the [Security tab](https://github.com/mahmutsalman/notes-with-audio-and-video/security/advisories/new) to privately report vulnerabilities

### What to Include

Please include as much of the following information as possible:

- **Type of vulnerability** (e.g., XSS, SQL injection, privilege escalation)
- **Affected version(s)**
- **Step-by-step reproduction instructions**
- **Proof-of-concept or exploit code** (if applicable)
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up questions

### What to Expect

When you report a vulnerability, here's what you can expect:

1. **Acknowledgment**: Within **48 hours** of your report
2. **Initial Assessment**: Within **5 business days**
   - Confirmation of the vulnerability
   - Severity classification (Critical/High/Medium/Low)
   - Estimated timeline for fix
3. **Progress Updates**: Regular updates every **7 days** until resolution
4. **Resolution**:
   - Critical: Within 7 days
   - High: Within 14 days
   - Medium: Within 30 days
   - Low: Within 60 days
5. **Disclosure**: Coordinated disclosure after fix is released
   - We will credit you in the security advisory (unless you prefer to remain anonymous)
   - Public disclosure only after fix is available

### Security Severity Levels

We classify security issues using the following severity levels:

#### Critical
- Remote code execution
- Privilege escalation to system/admin
- Exposure of highly sensitive data (credentials, private keys)
- Complete system compromise

#### High
- Significant data exposure
- Authentication bypass
- Authorization flaws affecting multiple users
- Denial of service affecting core functionality

#### Medium
- Limited data exposure
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Information disclosure of non-sensitive data

#### Low
- Minor information disclosure
- Issues requiring significant user interaction
- Issues with limited impact

### Bug Bounty Program

**Status**: We do not currently offer a bug bounty program.

However, we deeply appreciate security researchers who report vulnerabilities responsibly:
- Public acknowledgment in security advisories (with your permission)
- Credit in release notes
- Our sincere gratitude for helping keep our users safe

### Security Best Practices for Users

To protect yourself while using Notes With Audio And Video:

1. **Download from Official Sources Only**
   - GitHub Releases: https://github.com/mahmutsalman/notes-with-audio-and-video/releases
   - Verify digital signatures on Windows builds

2. **Keep Software Updated**
   - Enable notifications for new releases
   - Review release notes for security fixes
   - Update promptly when security patches are available

3. **Verify Downloads**
   - Check SHA256 checksums
   - Verify Windows code signatures
   - Report any signature warnings

4. **Protect Your Data**
   - Regular backups of your notes database
   - Keep sensitive information encrypted
   - Use strong passwords if implementing authentication

5. **Report Suspicious Behavior**
   - Contact us if you notice unusual app behavior
   - Report any phishing attempts using our name

### Known Security Considerations

#### Local Data Storage
- Notes are stored in a local SQLite database
- Database location: Platform-specific application data directory
- **User Responsibility**: Encrypt sensitive data before storage
- **User Responsibility**: Secure backups appropriately

#### Audio/Video Recording
- App requires microphone and screen recording permissions
- **User Responsibility**: Review permissions before granting
- Recordings stored locally only (no cloud upload)

#### Native Modules
- App uses native C++ modules for screen recording (macOS)
- Native modules built from source during installation
- **Security**: Modules signed and verified during build

#### Network Access
- App does not collect or transmit user data
- Network used only for software updates (GitHub API)
- No analytics or telemetry

### Security-Related Configuration

#### macOS Permissions
Required entitlements:
- `com.apple.security.device.audio-input` - For audio recording
- `com.apple.security.cs.allow-jit` - For JavaScript execution
- `com.apple.security.cs.allow-unsigned-executable-memory` - For V8 engine

These are normal for Electron applications and required for core functionality.

### Third-Party Dependencies

We regularly monitor our dependencies for security vulnerabilities using:
- GitHub Dependabot
- npm audit
- Regular security reviews

Critical dependency vulnerabilities are patched as quickly as possible.

### Code Signing

Our binaries are code-signed to ensure authenticity:

- **Windows**: Signed with SignPath Foundation certificate
- **macOS**: Currently unsigned (planned for future)
- **Linux**: Checksums provided

See our [Code Signing Policy](docs/CODE_SIGNING_POLICY.md) for details.

### Past Security Advisories

No security advisories have been published yet. When they are, they will be listed here and in the [GitHub Security Advisories](https://github.com/mahmutsalman/notes-with-audio-and-video/security/advisories) section.

### Security Contact

- **Primary**: csmahmutsalman@gmail.com
- **Subject Line**: `[SECURITY] <Brief Description>`
- **Expected Response Time**: 48 hours

### PGP Key

**Status**: PGP key not currently configured. Communications via email are acceptable.

If you require encrypted communication, please request a PGP key in your initial contact.

---

**Last Updated**: December 31, 2025

Thank you for helping keep Notes With Audio And Video and our users safe!
