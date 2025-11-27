import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface IOSProject {
  name: string;
  path: string;
  isWorkspace: boolean;
}

export interface Simulator {
  name: string;
  udid: string;
  state: string;
  runtime: string;
}

export interface Device {
  name: string;
  udid: string;
  version: string;
}

export class IOSService {
  async findIOSProjects(directory: string): Promise<IOSProject[]> {
    const projects: IOSProject[] = [];

    const findProjects = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common directories that shouldn't contain projects
        if (entry.isDirectory()) {
          if (['node_modules', 'Pods', '.git', 'build', 'DerivedData'].includes(entry.name)) {
            continue;
          }

          if (entry.name.endsWith('.xcworkspace')) {
            projects.push({
              name: entry.name,
              path: fullPath,
              isWorkspace: true,
            });
          } else if (entry.name.endsWith('.xcodeproj')) {
            projects.push({
              name: entry.name,
              path: fullPath,
              isWorkspace: false,
            });
          } else {
            // Recurse into subdirectories
            try {
              findProjects(fullPath);
            } catch (e) {
              // Skip directories we can't read
            }
          }
        }
      }
    };

    findProjects(directory);

    // Prefer workspaces over projects if both exist
    const workspaces = projects.filter(p => p.isWorkspace);
    if (workspaces.length > 0) {
      return workspaces;
    }

    return projects;
  }

  async getSchemes(projectPath: string, isWorkspace: boolean): Promise<string[]> {
    try {
      const flag = isWorkspace ? '-workspace' : '-project';
      const { stdout } = await execAsync(
        `xcodebuild ${flag} "${projectPath}" -list -json`
      );

      const data = JSON.parse(stdout);
      const schemes = data.project?.schemes || data.workspace?.schemes || [];

      if (schemes.length === 0) {
        throw new Error('No schemes found in project');
      }

      return schemes;
    } catch (error) {
      throw new Error(`Failed to get schemes: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getSimulators(): Promise<Simulator[]> {
    try {
      const { stdout } = await execAsync('xcrun simctl list devices available --json');
      const data = JSON.parse(stdout);

      const simulators: Simulator[] = [];

      for (const runtime in data.devices) {
        const devices = data.devices[runtime];
        const runtimeName = runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').replace(/-/g, ' ');

        for (const device of devices) {
          if (device.isAvailable) {
            simulators.push({
              name: device.name,
              udid: device.udid,
              state: device.state,
              runtime: runtimeName,
            });
          }
        }
      }

      // Sort by runtime (newest first) and then by name
      simulators.sort((a, b) => {
        const runtimeCompare = b.runtime.localeCompare(a.runtime);
        if (runtimeCompare !== 0) return runtimeCompare;
        return a.name.localeCompare(b.name);
      });

      return simulators;
    } catch (error) {
      throw new Error(`Failed to get simulators: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getDevices(): Promise<Device[]> {
    try {
      const { stdout } = await execAsync('xcrun xctrace list devices');
      const lines = stdout.split('\n');

      const devices: Device[] = [];
      for (const line of lines) {
        // Match physical devices (exclude simulators)
        const match = line.match(/^(.+?)\s+\((\d+\.\d+(?:\.\d+)?)\)\s+\(([A-F0-9-]+)\)$/);
        if (match && !line.includes('Simulator')) {
          devices.push({
            name: match[1].trim(),
            version: match[2],
            udid: match[3],
          });
        }
      }

      return devices;
    } catch (error) {
      throw new Error(`Failed to get devices: ${error instanceof Error ? error.message : error}`);
    }
  }

  async bootSimulator(udid: string): Promise<void> {
    try {
      await execAsync(`xcrun simctl boot ${udid}`);
      // Wait a bit for the simulator to boot
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      // Simulator might already be booted, which is fine
      const errorMessage = error instanceof Error ? error.message : '';
      if (!errorMessage.includes('Unable to boot device in current state: Booted')) {
        throw new Error(`Failed to boot simulator: ${errorMessage}`);
      }
    }
  }

  async buildAndRun(
    projectPath: string,
    scheme: string,
    destination: string,
    isWorkspace: boolean,
    onOutput?: (output: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const flag = isWorkspace ? '-workspace' : '-project';

      const command = `xcodebuild ${flag} "${projectPath}" \
        -scheme "${scheme}" \
        -destination "${destination}" \
        -configuration Debug \
        clean build \
        CODE_SIGN_IDENTITY="" \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGNING_ALLOWED=NO`;

      const buildProcess = exec(command, { maxBuffer: 10 * 1024 * 1024 });

      let lastOutput = '';
      let fullOutput = '';
      let errorOutput = '';

      buildProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        fullOutput += output;

        // Extract meaningful build progress
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('Building') || line.includes('Compiling') ||
              line.includes('Linking') || line.includes('Generating')) {
            lastOutput = line.trim();
            if (onOutput) onOutput(lastOutput);
          }
        }
      });

      buildProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;

        // Some warnings go to stderr but aren't fatal
        if (!output.includes('warning:')) {
          console.error(output);
        }
      });

      buildProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Install and launch the app
            await this.installAndLaunchApp(projectPath, scheme, destination, isWorkspace);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          // Extract error details from build output
          const errorDetails = this.extractBuildErrors(fullOutput, errorOutput);
          reject(new Error(`Build failed with exit code ${code}\n\n${errorDetails}`));
        }
      });

      buildProcess.on('error', (error) => {
        reject(new Error(`Build process error: ${error.message}`));
      });
    });
  }

  private extractBuildErrors(stdout: string, stderr: string): string {
    const lines = (stdout + '\n' + stderr).split('\n');
    const errors: string[] = [];
    const warnings: string[] = [];
    let failureSection = '';
    let inFailureSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Capture error lines
      if (line.includes('error:') && !line.includes('warning:')) {
        // Get context around the error (previous line and next 2 lines)
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length, i + 3);
        const errorContext = lines.slice(contextStart, contextEnd).join('\n');
        errors.push(errorContext);
      }

      // Capture the BUILD FAILED section
      if (line.includes('** BUILD FAILED **')) {
        inFailureSection = true;
      }

      if (inFailureSection) {
        failureSection += line + '\n';
        // Get the next 20 lines after BUILD FAILED to capture the summary
        if (failureSection.split('\n').length > 25) {
          inFailureSection = false;
        }
      }
    }

    let result = '';

    if (errors.length > 0) {
      result += '📋 Compilation Errors:\n\n';
      // Show up to 5 distinct errors to avoid overwhelming output
      const distinctErrors = [...new Set(errors)].slice(0, 5);
      result += distinctErrors.join('\n---\n') + '\n\n';

      if (errors.length > 5) {
        result += `... and ${errors.length - 5} more error(s)\n\n`;
      }
    }

    if (failureSection) {
      result += failureSection;
    }

    if (!result) {
      result = 'Build failed but no specific errors were captured. The build output may contain more details.';
    }

    return result;
  }

  private async installAndLaunchApp(
    projectPath: string,
    scheme: string,
    destination: string,
    isWorkspace: boolean
  ): Promise<void> {
    try {
      // Get the build directory
      const projectDir = path.dirname(projectPath);
      const buildDir = path.join(projectDir, 'build', 'Debug-iphonesimulator');

      // Find the .app bundle
      if (!fs.existsSync(buildDir)) {
        throw new Error('Build directory not found');
      }

      const apps = fs.readdirSync(buildDir).filter(f => f.endsWith('.app'));
      if (apps.length === 0) {
        throw new Error('No .app bundle found in build directory');
      }

      const appPath = path.join(buildDir, apps[0]);

      // Extract simulator UDID from destination if it's a simulator
      if (destination.includes('iOS Simulator')) {
        const nameMatch = destination.match(/name=([^,]+)/);
        if (nameMatch) {
          const simulatorName = nameMatch[1];
          const simulators = await this.getSimulators();
          const simulator = simulators.find(s => s.name === simulatorName);

          if (simulator) {
            // Install the app
            await execAsync(`xcrun simctl install ${simulator.udid} "${appPath}"`);

            // Get bundle identifier
            const { stdout } = await execAsync(`defaults read "${appPath}/Info.plist" CFBundleIdentifier`);
            const bundleId = stdout.trim();

            // Launch the app
            await execAsync(`xcrun simctl launch ${simulator.udid} ${bundleId}`);
          }
        }
      } else {
        // For physical devices, the app should already be installed and launched by xcodebuild
        // We can optionally trigger a manual install here if needed
      }
    } catch (error) {
      // Non-fatal: build succeeded but launch might have failed
      console.warn(`Note: App built successfully but launch may have failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
