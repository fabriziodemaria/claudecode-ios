# iOS PR Runner

A command-line tool that allows you to:
- Connect to GitHub
- Select a repository
- Select a pull request
- Compile an iOS app
- Run it on a simulator or real device of your choice

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

### Run the CLI

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

### Workflow

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

## Example Session

```
🔐 GitHub Authentication

? Enter your GitHub Personal Access Token: **********************

📦 Repository Selection

✔ Fetching repositories...
? Select a repository: myorg/awesome-ios-app

🔀 Pull Request Selection

✔ Fetching pull requests...
? Select a pull request: #42: Add new feature (by johndoe)

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
