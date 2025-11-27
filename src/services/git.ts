import simpleGit from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

export class GitService {
  async cloneAndCheckoutPR(
    repoUrl: string,
    branch: string,
    targetDir: string
  ): Promise<void> {
    try {
      // Clean up existing directory if it exists
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      // Create parent directory if needed
      const parentDir = path.dirname(targetDir);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Clone the repository
      const git = simpleGit();
      await git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch']);

      // Verify the checkout
      const repoGit = simpleGit(targetDir);
      const status = await repoGit.status();

      if (status.current !== branch) {
        throw new Error(`Failed to checkout branch ${branch}`);
      }
    } catch (error) {
      throw new Error(`Git operation failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
