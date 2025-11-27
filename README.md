# iOS PR Runner

A powerful command-line tool that streamlines iOS PR testing and development:

- **Connect to GitHub** - Authenticate and access your repositories
- **Browse and select PRs** - Interactive selection or view latest PRs by timestamp
- **Monitor repositories** - Watch for new PRs in real-time with the watch mode
- **Compile iOS apps** - Build projects using xcodebuild
- **Run on any target** - Choose simulators or physical devices
- **Quick iterations** - Refresh PR lists and build immediately

## Prerequisites

Before using this tool, ensure you have the following installed:

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **Xcode** (with Command Line Tools)
   ```bash
   xcode-select --version
   ```

3. **iOS Simulators** (installed via Xcode)

4. **GitHub Personal Access Token**
   - Go to https://github.com/settings/tokens
   - Click "Generate new token" (classic)
   - Select scopes: `repo` (for private repositories) and `public_repo`
   - Copy the generated token

## Installation

1. Clone this repository and navigate to the directory:
   ```bash
   cd claudecode-ios
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. (Optional) Link the CLI globally:
   ```bash
   npm link
   ```

## Usage

The CLI provides three main commands:

### 1. `run` - Interactive full workflow

Select a repository and PR interactively, then build and run.

If you linked globally:
```bash
ios-pr-runner run
```

If not linked:
```bash
npm start run
```

Or during development:
```bash
npm run dev run
```

#### Workflow

The CLI will guide you through an interactive workflow:

1. **GitHub Authentication**
   - Enter your GitHub Personal Access Token
   - The token is not stored and only used for the current session

2. **Repository Selection**
   - Browse your accessible repositories
   - Select the repository containing the iOS project

3. **Pull Request Selection**
   - View all open pull requests
   - Select the PR you want to test

4. **Project Checkout**
   - The PR branch is automatically cloned to `/tmp/ios-pr-{repo}-{pr-number}`
   - The correct branch is checked out

5. **iOS Project Detection**
   - Automatically finds `.xcodeproj` or `.xcworkspace` files
   - Prefers workspaces over projects (important for CocoaPods)
   - Prompts for selection if multiple projects exist

6. **Scheme Selection**
   - Detects available schemes
   - Prompts for selection if multiple schemes exist

7. **Destination Selection**
   - Choose between iOS Simulator or Physical Device
   - For simulators: browse available simulators with runtime info
   - For devices: browse connected devices

8. **Build and Run**
   - Compiles the project using xcodebuild
   - Installs the app on the selected destination
   - Launches the app automatically

#### Example Session

```
🔐 GitHub Authentication

? Enter your GitHub Personal Access Token: **********************

📦 Repository Selection

✔ Fetching repositories...
? Select a repository: myorg/awesome-ios-app

🔀 Pull Request Selection

✔ Fetching pull requests...
? Select a pull request: #42: Add new feature (by johndoe) - Updated 2h ago

📥 Checking out PR

✔ Cloning repository and checking out PR...
✓ Checked out PR #42 to /tmp/ios-pr-awesome-ios-app-42

📱 iOS Project Detection

✓ Using project: AwesomeApp.xcworkspace

? Select a scheme to build: AwesomeApp

🎯 Destination Selection

? Where do you want to run the app? 📱 iOS Simulator
? Select a simulator: iPhone 15 Pro (iOS 17.0) 🟢

🔨 Building and Running

✔ Building project...
✓ App built and launched successfully!
```

### 2. `latest` - View and build latest PRs

Quickly view the most recently updated PRs for a repository, with the option to refresh the list or build a PR immediately. Perfect for monitoring active development!

```bash
# Interactive repository selection
ios-pr-runner latest

# Specify repository directly
ios-pr-runner latest -r owner/repo

# Show top 5 PRs (default is 10)
ios-pr-runner latest -r owner/repo -n 5
```

#### Features:
- Shows PRs sorted by most recently updated
- Displays relative timestamps (e.g., "Updated 2h ago", "Updated 3d ago")
- Refresh option to check for updates
- Quick build option to immediately build a selected PR

#### Example Session

```
🔐 GitHub Authentication
? Enter your GitHub Personal Access Token: **********************

⏱️  Latest PRs for myorg/awesome-ios-app

Showing 10 most recently updated PR(s):

1. #45: Fix crash on startup (by alice) - Updated just now
2. #44: Improve performance (by bob) - Updated 3h ago
3. #43: Update dependencies (by charlie) - Updated 5h ago
4. #42: Add new feature (by johndoe) - Updated 1d ago
5. #41: Refactor code (by jane) - Updated 2d ago

? What would you like to do?
  🚀 Build and run a PR
  🔄 Refresh list
  ❌ Exit
```

### 3. `watch` - Monitor repository for new PRs

Continuously monitor a repository and get notified when new PRs are opened. Great for CI/CD workflows or staying on top of team activity!

```bash
# Watch a repository (checks every 60 seconds by default)
ios-pr-runner watch -r owner/repo

# Custom check interval (in seconds)
ios-pr-runner watch -r owner/repo -i 30
```

#### Features:
- Real-time monitoring for new PRs
- Notifications when PRs are opened
- Tracks when PRs are closed or merged
- Option to immediately build new PRs
- Graceful shutdown with Ctrl+C

#### Example Session

```
🔐 GitHub Authentication
? Enter your GitHub Personal Access Token: **********************

✓ Connected to myorg/awesome-ios-app

👀 Watching for new PRs (checking every 60s)

Press Ctrl+C to stop watching

[10:30:45 AM] Currently tracking 12 open PR(s)
[10:31:45 AM] No new PRs. Still watching...
[10:32:45 AM] No new PRs. Still watching...

🎉 1 new PR(s) detected!

NEW: #46: Add dark mode (by sarah) - Updated just now

? Would you like to build one of these PRs now? Yes
? Select a PR to build: #46: Add dark mode (by sarah) - Updated just now

[Builds and runs the PR...]

👀 Resuming watch...

[10:34:00 AM] No new PRs. Still watching...
```

## Troubleshooting

### Code Signing Issues

The tool disables code signing by default for simulator builds:
```bash
CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO
```

For physical devices, you may need to configure code signing in Xcode.

### Simulator Not Booting

If a simulator fails to boot, try:
```bash
xcrun simctl shutdown all
xcrun simctl erase all
```

### Build Failures

Check the Xcode project configuration:
- Ensure the scheme is shared (Xcode → Product → Scheme → Manage Schemes → Check "Shared")
- Verify dependencies are installed (CocoaPods, Swift Package Manager, etc.)

### No Devices Found

For physical devices:
- Ensure the device is connected via USB
- Trust the computer on the device
- Check that the device appears in Xcode's Devices window

## Configuration

### Custom Build Settings

You can modify build settings in `src/services/ios.ts`:

```typescript
const command = `xcodebuild ${flag} "${projectPath}" \
  -scheme "${scheme}" \
  -destination "${destination}" \
  -configuration Debug \  // Change to Release if needed
  clean build`;
```

### GitHub API Rate Limits

The GitHub API has rate limits:
- Authenticated: 5,000 requests/hour
- Unauthenticated: 60 requests/hour

This tool uses authenticated requests with your personal access token.

## Development

### Project Structure

```
src/
├── index.ts              # CLI entry point
└── services/
    ├── github.ts         # GitHub API interactions
    ├── git.ts            # Git operations
    └── ios.ts            # iOS build and deployment
```

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
