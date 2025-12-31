# Code Signing Policy

**Last Updated**: December 31, 2025
**Effective Date**: December 31, 2025

## Purpose

This document defines the code signing policy for Notes With Audio And Video to ensure:
- Binary authenticity and integrity
- Protection against tampering
- Trust for end users
- Compliance with SignPath Foundation requirements

## Scope

This policy applies to all official releases of Notes With Audio And Video distributed through:
- GitHub Releases
- Direct downloads
- Any official distribution channels

## Roles and Responsibilities

### Maintainer
- **Name**: Mahmut Salman
- **Email**: csmahmutsalman@gmail.com
- **Responsibilities**:
  - Code review and approval
  - Release authorization
  - Security incident response
  - Policy maintenance

### Contributors
- **Responsibilities**:
  - Submit code via pull requests
  - No direct access to signing infrastructure
  - Follow contribution guidelines
  - Report security issues responsibly

### Automated Systems
- **GitHub Actions**:
  - Build automation
  - Artifact generation
  - SignPath integration
  - Release publishing

## Release Process

### 1. Development Phase
- All code changes submitted via pull requests
- Required: At least one code review approval
- Required: All CI checks must pass
- Required: Branch must be up-to-date with main

### 2. Build Phase
- Builds triggered automatically by Git tags matching `v*.*.*`
- All builds performed on GitHub Actions runners (Ubuntu, macOS, Windows)
- Build artifacts uploaded to GitHub Actions
- Build logs preserved for audit trail

### 3. Signing Phase (Windows Only)
- Unsigned Windows executables submitted to SignPath Foundation
- SignPath verifies build origin and integrity
- Authenticode signature applied by SignPath
- Signed executables returned to GitHub Actions

### 4. Release Phase
- Signed Windows executables combined with macOS and Linux builds
- Release created on GitHub with version tag
- Release notes generated automatically
- Artifacts published to GitHub Releases

### 5. Distribution Phase
- Users download from official GitHub Releases only
- SHA256 checksums provided for verification
- Release notes include SignPath attribution

## Security Requirements

### Multi-Factor Authentication (MFA)
- **Required for**: All team members with repository write access
- **Platforms**: GitHub, SignPath (if applicable)
- **Enforcement**: GitHub organization MFA policy enabled

### Access Control
- **GitHub Repository**:
  - Protected main branch (no direct pushes)
  - Required pull request reviews
  - Required status checks before merge
  - No force pushes allowed

- **SignPath**:
  - API tokens stored as GitHub Secrets only
  - Token rotation: Quarterly or on team changes
  - Principle of least privilege

### Build Integrity
- **Traceability**: All builds traced to specific Git commits
- **Reproducibility**: Builds can be reproduced from source
- **No Manual Uploads**: No manual binary uploads to SignPath
- **Audit Logs**: GitHub Actions logs retained for 90 days

### Code Review
- **Minimum Reviews**: 1 approval required for all PRs
- **Self-Review**: Not permitted (different person must review)
- **Focus Areas**:
  - Security vulnerabilities
  - Code quality
  - Test coverage
  - Breaking changes

## Signing Infrastructure

### Windows (SignPath Foundation)
- **Certificate**: SignPath Foundation certificate
- **Signature Type**: Authenticode
- **Algorithm**: SHA-256
- **Timestamp**: Included (ensures validity after certificate expiration)
- **Verification**: Windows SmartScreen and signature verification

### macOS (Currently Unsigned)
- **Status**: Not currently signed
- **User Experience**: Users see "unidentified developer" warning
- **Workaround**: Right-click → Open (first time only)
- **Future Plan**: Apple Developer certificate when user base justifies cost

### Linux (No Standard Signing)
- **Checksums**: SHA256 checksums provided
- **Verification**: Users can verify checksums manually
- **Optional**: GPG signatures may be added in future

## Incident Response

### Security Vulnerability Discovered

1. **Report received** via SECURITY.md process
2. **Initial assessment** within 48 hours
3. **Severity classification** (Critical/High/Medium/Low)
4. **Fix development** in private security fork
5. **Testing and validation**
6. **Coordinated disclosure** with reporter
7. **Emergency release** if critical
8. **Post-mortem** and policy updates

### Compromised Signing Key/Certificate

**Immediate Actions** (within 1 hour):
1. Revoke compromised certificate (contact SignPath Foundation)
2. Remove affected releases from GitHub
3. Publish security advisory
4. Notify users via all channels

**Recovery Actions** (within 24 hours):
1. Request new certificate from SignPath Foundation
2. Audit all recent releases
3. Identify scope of compromise
4. Rebuild and re-sign legitimate releases

**Long-term Actions** (within 1 week):
1. Root cause analysis
2. Policy and procedure updates
3. Security review of infrastructure
4. Team training on new procedures

### Compromised Build Pipeline

**Immediate Actions**:
1. Disable GitHub Actions workflows
2. Rotate all secrets and tokens
3. Audit recent builds and releases
4. Publish holding statement

**Investigation**:
1. Review audit logs
2. Identify unauthorized changes
3. Assess impact on releases
4. Determine attack vector

**Recovery**:
1. Clean and restore build pipeline
2. Verify all infrastructure components
3. Re-enable with enhanced monitoring
4. Resume builds with additional validation

## Monitoring and Auditing

### Regular Reviews
- **Quarterly**: Review access permissions
- **Quarterly**: Rotate API tokens
- **Monthly**: Review build logs for anomalies
- **Weekly**: Monitor for security advisories in dependencies

### Metrics
- Pull request review time
- CI/CD success rate
- Signing success rate
- Release frequency

### Audit Trail
- All commits tracked in Git
- All builds logged in GitHub Actions
- All signatures verifiable via SignPath
- All releases documented in GitHub

## Compliance

This policy ensures compliance with:
- **SignPath Foundation Requirements**: Code of Conduct for Foundation Certificates
- **GitHub Security Best Practices**: MFA, branch protection, secret management
- **Industry Standards**: Secure software development lifecycle (SSDLC)

## Policy Updates

### Amendment Process
1. Proposed changes discussed in GitHub Issues
2. Community feedback period (minimum 7 days)
3. Maintainer approval required
4. Updated policy committed to repository
5. Announcement in release notes

### Version History
- v1.0 (2025-12-31): Initial policy creation

## Acknowledgments

Code signing for this project is graciously provided by:
- **[SignPath.io](https://signpath.io)** - Code signing service
- **[SignPath Foundation](https://signpath.org)** - Free certificates for open-source projects

## Contact

For questions about this policy:
- **Email**: csmahmutsalman@gmail.com
- **GitHub Issues**: [Open an issue](https://github.com/mahmutsalman/notes-with-audio-and-video/issues)
- **Security Issues**: See [SECURITY.md](../SECURITY.md)

---

**Document Owner**: Mahmut Salman
**Review Frequency**: Quarterly or on significant changes
