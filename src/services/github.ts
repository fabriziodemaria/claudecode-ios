import { Octokit } from '@octokit/rest';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getRepositories() {
    try {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
      });
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch repositories: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getRepository(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo,
      });
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch repository: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getPullRequests(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch pull requests: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number) {
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch pull request: ${error instanceof Error ? error.message : error}`);
    }
  }
}
