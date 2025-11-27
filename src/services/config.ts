import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.ios-pr-runner');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  githubToken?: string;
}

export class ConfigService {
  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private readConfig(): Config {
    this.ensureConfigDir();

    if (!fs.existsSync(CONFIG_FILE)) {
      return {};
    }

    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read config file:', error);
      return {};
    }
  }

  private writeConfig(config: Config): void {
    this.ensureConfigDir();

    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
        mode: 0o600
      });
    } catch (error) {
      console.error('Failed to write config file:', error);
    }
  }

  getGitHubToken(): string | undefined {
    const config = this.readConfig();
    return config.githubToken;
  }

  saveGitHubToken(token: string): void {
    const config = this.readConfig();
    config.githubToken = token;
    this.writeConfig(config);
  }

  clearGitHubToken(): void {
    const config = this.readConfig();
    delete config.githubToken;
    this.writeConfig(config);
  }

  hasGitHubToken(): boolean {
    const token = this.getGitHubToken();
    return token !== undefined && token.length > 0;
  }
}
