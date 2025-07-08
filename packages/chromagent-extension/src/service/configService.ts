
interface ConfigItem {
  description: string;
  defaultValue?: any;
}

class ConfigService {
  private storageKey = 'chromagent_config';

  constructor() {
    this.loadConfig();
  }

  private async loadConfig(): Promise<Record<string, ConfigItem>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (result) => {
        resolve(result[this.storageKey] || {});
      });
    });
  }

  private async saveConfig(config: Record<string, ConfigItem>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: config }, () => {
        resolve();
      });
    });
  }

  async set(name: string, description: string, defaultValue?: any): Promise<void> {
    const config = await this.loadConfig();
    config[name] = { description, defaultValue };
    await this.saveConfig(config);
  }

  async unset(name: string): Promise<void> {
    const config = await this.loadConfig();
    delete config[name];
    await this.saveConfig(config);
  }

  async get(name: string): Promise<any | undefined> {
    const config = await this.loadConfig();
    const item = config[name];
    if (item) {
      return item.defaultValue;
    }
    return undefined;
  }
}

export const configService = new ConfigService();
