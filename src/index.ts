#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { GitHubService } from './services/github';
import { IOSService } from './services/ios';
import { GitService } from './services/git';
import { ConfigService } from './services/config';

const program = new Command();
const configService = new ConfigService();

// Helper function to authenticate with GitHub
async function authenticateGitHub(): Promise<GitHubService> {
  console.log(chalk.blue('\n🔐 GitHub Authentication\n'));

  const savedToken = configService.getGitHubToken();
  let githubToken: string;

  if (savedToken) {
    const { useSavedToken } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useSavedToken',
        message: 'Use saved GitHub token?',
        default: true,
      },
    ]);

    if (useSavedToken) {
      githubToken = savedToken;
    } else {
      const result = await inquirer.prompt([
        {
          type: 'password',
          name: 'githubToken',
          message: 'Enter your GitHub Personal Access Token:',
          validate: (input) => input.length > 0 || 'Token is required',
        },
      ]);
      githubToken = result.githubToken;

      const { saveToken } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saveToken',
          message: 'Save this token for future use?',
          default: true,
        },
      ]);

      if (saveToken) {
        configService.saveGitHubToken(githubToken);
        console.log(chalk.green('✓ Token saved successfully'));
      }
    }
  } else {
    const result = await inquirer.prompt([
      {
        type: 'password',
        name: 'githubToken',
        message: 'Enter your GitHub Personal Access Token:',
        validate: (input) => input.length > 0 || 'Token is required',
      },
    ]);
    githubToken = result.githubToken;

    const { saveToken } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveToken',
        message: 'Save this token for future use?',
        default: true,
      },
    ]);

    if (saveToken) {
      configService.saveGitHubToken(githubToken);
      console.log(chalk.green('✓ Token saved successfully'));
    }
  }

  return new GitHubService(githubToken);
}

// Helper function to format PR display with timestamps
function formatPRDisplay(pr: any): string {
  const createdAt = new Date(pr.created_at);
  const updatedAt = new Date(pr.updated_at);
  const now = new Date();
  const hoursSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60));

  let timeStr = '';
  if (hoursSinceUpdate < 1) {
    timeStr = 'Updated just now';
  } else if (hoursSinceUpdate < 24) {
    timeStr = `Updated ${hoursSinceUpdate}h ago`;
  } else {
    const daysSinceUpdate = Math.floor(hoursSinceUpdate / 24);
    timeStr = `Updated ${daysSinceUpdate}d ago`;
  }

  return `#${pr.number}: ${pr.title} (by ${pr.user?.login}) - ${timeStr}`;
}

// Helper function to select device/simulator destination
async function selectDestination(iosService: IOSService): Promise<string | null> {
  const spinner = ora();

  console.log(chalk.blue('\n🎯 Destination Selection\n'));
  const { destinationType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'destinationType',
      message: 'Where do you want to run the app?',
      choices: [
        { name: '📱 iOS Simulator', value: 'simulator' },
        { name: '📲 Physical Device', value: 'device' },
      ],
    },
  ]);

  let destination: string;
  if (destinationType === 'simulator') {
    spinner.start('Fetching simulators...');
    const simulators = await iosService.getSimulators();
    spinner.stop();

    const { selectedSimulator } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedSimulator',
        message: 'Select a simulator:',
        choices: simulators.map(sim => ({
          name: `${sim.name} (${sim.runtime}) ${sim.state === 'Booted' ? '🟢' : '⚪'}`,
          value: sim,
        })),
        pageSize: 15,
      },
    ]);

    destination = `platform=iOS Simulator,name=${selectedSimulator.name}`;

    // Boot simulator if not already running
    if (selectedSimulator.state !== 'Booted') {
      spinner.start('Booting simulator...');
      await iosService.bootSimulator(selectedSimulator.udid);
      spinner.stop();
    }
  } else {
    spinner.start('Fetching devices...');
    const devices = await iosService.getDevices();
    spinner.stop();

    if (devices.length === 0) {
      console.log(chalk.red('No connected devices found.'));
      return null;
    }

    const { selectedDevice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedDevice',
        message: 'Select a device:',
        choices: devices.map(dev => ({
          name: `${dev.name} (${dev.version})`,
          value: dev,
        })),
      },
    ]);

    destination = `platform=iOS,id=${selectedDevice.udid}`;
  }

  return destination;
}

// Helper function to build and run a PR
async function buildAndRunPR(
  githubService: GitHubService,
  selectedRepo: any,
  selectedPR: any
): Promise<void> {
  const spinner = ora();

  // Clone/Checkout PR
  console.log(chalk.blue('\n📥 Checking out PR\n'));
  const workDir = `/tmp/ios-pr-${selectedRepo.name}-${selectedPR.number}`;

  spinner.start('Cloning repository and checking out PR...');
  const gitService = new GitService();
  await gitService.cloneAndCheckoutPR(
    selectedRepo.clone_url,
    selectedPR.head.ref,
    workDir
  );
  spinner.stop();

  console.log(chalk.green(`✓ Checked out PR #${selectedPR.number} to ${workDir}`));

  // Detect iOS projects
  console.log(chalk.blue('\n📱 iOS Project Detection\n'));
  const iosService = new IOSService();
  const projects = await iosService.findIOSProjects(workDir);

  if (projects.length === 0) {
    console.log(chalk.red('No iOS projects (.xcodeproj or .xcworkspace) found.'));
    return;
  }

  let selectedProject = projects[0];
  if (projects.length > 1) {
    const result = await inquirer.prompt([
      {
        type: 'list',
        name: 'project',
        message: 'Multiple iOS projects found. Select one:',
        choices: projects.map(p => ({
          name: p.name,
          value: p,
        })),
      },
    ]);
    selectedProject = result.project;
  }

  console.log(chalk.green(`✓ Using project: ${selectedProject.name}`));

  // Select scheme
  spinner.start('Detecting schemes...');
  const schemes = await iosService.getSchemes(selectedProject.path, selectedProject.isWorkspace);
  spinner.stop();

  let selectedScheme = schemes[0];
  if (schemes.length > 1) {
    const result = await inquirer.prompt([
      {
        type: 'list',
        name: 'scheme',
        message: 'Select a scheme to build:',
        choices: schemes,
      },
    ]);
    selectedScheme = result.scheme;
  }

  // Build and run loop with retry logic
  let shouldContinue = true;
  let destination: string | null = null;

  while (shouldContinue) {
    // Select destination if not already selected or if reselecting
    if (!destination) {
      destination = await selectDestination(iosService);
      if (!destination) {
        return;
      }
    }

    // Build and run
    console.log(chalk.blue('\n🔨 Building and Running\n'));
    spinner.start('Building project...');

    try {
      await iosService.buildAndRun(
        selectedProject.path,
        selectedScheme,
        destination,
        selectedProject.isWorkspace,
        (output) => {
          spinner.text = output;
        }
      );

      spinner.stop();
      console.log(chalk.green('\n✓ App built and launched successfully!\n'));
      shouldContinue = false;
    } catch (error) {
      spinner.stop();
      console.log(chalk.red('\n❌ Build/Run failed:'), error instanceof Error ? error.message : error);

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🔄 Try again with same device', value: 'retry' },
            { name: '📱 Select a different device/simulator', value: 'reselect' },
            { name: '❌ Exit', value: 'exit' },
          ],
        },
      ]);

      if (action === 'exit') {
        shouldContinue = false;
      } else if (action === 'retry') {
        // Keep the same destination and retry
        continue;
      } else if (action === 'reselect') {
        // Clear destination to force re-selection
        destination = null;
        continue;
      }
    }
  }
}

program
  .name('ios-pr-runner')
  .description('CLI tool to checkout GitHub PRs and run iOS apps on simulators or devices')
  .version('1.0.0');

program
  .command('run')
  .description('Select a GitHub repo, PR, and run the iOS app')
  .action(async () => {
    try {
      const spinner = ora();

      // Step 1: GitHub Authentication
      const githubService = await authenticateGitHub();

      // Step 2: Select Repository
      console.log(chalk.blue('\n📦 Repository Selection\n'));
      spinner.start('Fetching repositories...');
      const repos = await githubService.getRepositories();
      spinner.stop();

      if (repos.length === 0) {
        console.log(chalk.red('No repositories found.'));
        return;
      }

      const { selectedRepo } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedRepo',
          message: 'Select a repository:',
          choices: repos.map(repo => ({
            name: `${repo.full_name} ${repo.private ? '🔒' : ''}`,
            value: repo,
          })),
          pageSize: 15,
        },
      ]);

      // Step 3: Select Pull Request
      console.log(chalk.blue('\n🔀 Pull Request Selection\n'));
      spinner.start('Fetching pull requests...');
      const prs = await githubService.getPullRequests(
        selectedRepo.owner.login,
        selectedRepo.name
      );
      spinner.stop();

      if (prs.length === 0) {
        console.log(chalk.red('No open pull requests found.'));
        return;
      }

      const { selectedPR } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedPR',
          message: 'Select a pull request:',
          choices: prs.map(pr => ({
            name: formatPRDisplay(pr),
            value: pr,
          })),
          pageSize: 15,
        },
      ]);

      await buildAndRunPR(githubService, selectedRepo, selectedPR);

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('latest')
  .description('View and build the latest PRs for a specific repository')
  .option('-r, --repo <repo>', 'Repository in format "owner/repo"')
  .option('-n, --number <number>', 'Number of latest PRs to show (default: 10)', '10')
  .action(async (options) => {
    try {
      const spinner = ora();

      // GitHub Authentication
      const githubService = await authenticateGitHub();

      let selectedRepo: any;

      if (options.repo) {
        // Use provided repo
        const [owner, repoName] = options.repo.split('/');
        if (!owner || !repoName) {
          console.log(chalk.red('Invalid repository format. Use: owner/repo'));
          return;
        }

        spinner.start(`Fetching repository ${options.repo}...`);
        try {
          selectedRepo = await githubService.getRepository(owner, repoName);
          spinner.stop();
        } catch (error) {
          spinner.stop();
          console.log(chalk.red(`Repository ${options.repo} not found or not accessible.`));
          return;
        }
      } else {
        // Select repository interactively
        console.log(chalk.blue('\n📦 Repository Selection\n'));
        spinner.start('Fetching repositories...');
        const repos = await githubService.getRepositories();
        spinner.stop();

        if (repos.length === 0) {
          console.log(chalk.red('No repositories found.'));
          return;
        }

        const result = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedRepo',
            message: 'Select a repository:',
            choices: repos.map(repo => ({
              name: `${repo.full_name} ${repo.private ? '🔒' : ''}`,
              value: repo,
            })),
            pageSize: 15,
          },
        ]);
        selectedRepo = result.selectedRepo;
      }

      console.log(chalk.blue(`\n⏱️  Latest PRs for ${selectedRepo.full_name}\n`));

      spinner.start('Fetching pull requests...');
      const allPRs = await githubService.getPullRequests(
        selectedRepo.owner.login,
        selectedRepo.name
      );
      spinner.stop();

      if (allPRs.length === 0) {
        console.log(chalk.red('No open pull requests found.'));
        return;
      }

      // Sort by most recently updated
      const sortedPRs = allPRs.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

      // Take the latest N PRs
      const limit = parseInt(options.number, 10);
      const latestPRs = sortedPRs.slice(0, limit);

      // Display latest PRs
      console.log(chalk.green(`Showing ${latestPRs.length} most recently updated PR(s):\n`));
      latestPRs.forEach((pr, index) => {
        console.log(`${index + 1}. ${formatPRDisplay(pr)}`);
      });

      console.log('');

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🚀 Build and run a PR', value: 'build' },
            { name: '🔄 Refresh list', value: 'refresh' },
            { name: '❌ Exit', value: 'exit' },
          ],
        },
      ]);

      if (action === 'exit') {
        return;
      }

      if (action === 'refresh') {
        // Re-fetch and display
        console.log(chalk.blue('\n🔄 Refreshing...\n'));

        spinner.start('Fetching pull requests...');
        const refreshedPRs = await githubService.getPullRequests(
          selectedRepo.owner.login,
          selectedRepo.name
        );
        spinner.stop();

        if (refreshedPRs.length === 0) {
          console.log(chalk.red('No open pull requests found.'));
          return;
        }

        const refreshedSorted = refreshedPRs.sort((a, b) => {
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        const refreshedLatest = refreshedSorted.slice(0, limit);

        console.log(chalk.green(`Showing ${refreshedLatest.length} most recently updated PR(s):\n`));
        refreshedLatest.forEach((pr, index) => {
          console.log(`${index + 1}. ${formatPRDisplay(pr)}`);
        });

        console.log('');
        return;
      }

      if (action === 'build') {
        const { selectedPR } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedPR',
            message: 'Select a PR to build:',
            choices: latestPRs.map(pr => ({
              name: formatPRDisplay(pr),
              value: pr,
            })),
            pageSize: 15,
          },
        ]);

        await buildAndRunPR(githubService, selectedRepo, selectedPR);
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch a repository for new PRs and get notified')
  .requiredOption('-r, --repo <repo>', 'Repository in format "owner/repo"')
  .option('-i, --interval <seconds>', 'Check interval in seconds (default: 60)', '60')
  .action(async (options) => {
    try {
      const spinner = ora();

      // GitHub Authentication
      const githubService = await authenticateGitHub();

      // Parse repo
      const [owner, repoName] = options.repo.split('/');
      if (!owner || !repoName) {
        console.log(chalk.red('Invalid repository format. Use: owner/repo'));
        return;
      }

      // Verify repo exists
      spinner.start(`Connecting to ${options.repo}...`);
      let selectedRepo: any;
      try {
        selectedRepo = await githubService.getRepository(owner, repoName);
        spinner.stop();
      } catch (error) {
        spinner.stop();
        console.log(chalk.red(`Repository ${options.repo} not found or not accessible.`));
        return;
      }

      console.log(chalk.green(`✓ Connected to ${selectedRepo.full_name}`));
      console.log(chalk.blue(`\n👀 Watching for new PRs (checking every ${options.interval}s)\n`));
      console.log(chalk.gray('Press Ctrl+C to stop watching\n'));

      let knownPRs = new Set<number>();
      let isFirstCheck = true;

      const checkForPRs = async () => {
        try {
          const prs = await githubService.getPullRequests(owner, repoName);

          if (isFirstCheck) {
            // Initialize with current PRs
            prs.forEach(pr => knownPRs.add(pr.number));
            console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] Currently tracking ${prs.length} open PR(s)`));
            isFirstCheck = false;
            return;
          }

          // Check for new PRs
          const newPRs = prs.filter(pr => !knownPRs.has(pr.number));

          if (newPRs.length > 0) {
            console.log(chalk.green(`\n🎉 ${newPRs.length} new PR(s) detected!\n`));

            for (const pr of newPRs) {
              console.log(chalk.yellow(`NEW: ${formatPRDisplay(pr)}`));
              knownPRs.add(pr.number);
            }

            console.log('');

            const { shouldBuild } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'shouldBuild',
                message: 'Would you like to build one of these PRs now?',
                default: false,
              },
            ]);

            if (shouldBuild) {
              const { selectedPR } = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'selectedPR',
                  message: 'Select a PR to build:',
                  choices: newPRs.map(pr => ({
                    name: formatPRDisplay(pr),
                    value: pr,
                  })),
                },
              ]);

              await buildAndRunPR(githubService, selectedRepo, selectedPR);
              console.log(chalk.blue('\n👀 Resuming watch...\n'));
            }
          } else {
            console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] No new PRs. Still watching...`));
          }

          // Check for closed PRs
          const currentPRNumbers = new Set(prs.map(pr => pr.number));
          const closedPRs = Array.from(knownPRs).filter(num => !currentPRNumbers.has(num));

          if (closedPRs.length > 0) {
            closedPRs.forEach(num => {
              knownPRs.delete(num);
              console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] PR #${num} was closed or merged`));
            });
          }

        } catch (error) {
          console.error(chalk.red(`[${new Date().toLocaleTimeString()}] Error checking PRs:`), error instanceof Error ? error.message : error);
        }
      };

      // Initial check
      await checkForPRs();

      // Set up interval
      const intervalMs = parseInt(options.interval, 10) * 1000;
      const intervalId = setInterval(checkForPRs, intervalMs);

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        clearInterval(intervalId);
        console.log(chalk.blue('\n\n👋 Stopped watching. Goodbye!\n'));
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
