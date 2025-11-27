#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { GitHubService } from './services/github';
import { IOSService } from './services/ios';
import { GitService } from './services/git';

const program = new Command();

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
      console.log(chalk.blue('\n🔐 GitHub Authentication\n'));
      const { githubToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'githubToken',
          message: 'Enter your GitHub Personal Access Token:',
          validate: (input) => input.length > 0 || 'Token is required',
        },
      ]);

      const githubService = new GitHubService(githubToken);

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
            name: `#${pr.number}: ${pr.title} (by ${pr.user?.login})`,
            value: pr,
          })),
          pageSize: 15,
        },
      ]);

      // Step 4: Clone/Checkout PR
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

      // Step 5: Detect iOS projects
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

      // Step 6: Select scheme
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

      // Step 7: Select destination (simulator or device)
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
          return;
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

      // Step 8: Build and run
      console.log(chalk.blue('\n🔨 Building and Running\n'));
      spinner.start('Building project...');

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

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
