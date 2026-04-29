import { getPref, setPref } from "../utils/prefs";

declare const PathUtils: {
  join(...parts: string[]): string;
};

declare const IOUtils: {
  readUTF8(path: string): Promise<string>;
};

type WakaTimeHeartbeat = {
  entity: string;
  type: "file" | "app" | "domain";
  category: "researching";
  time: number;
  project: string;
};

export class WakaTimeClient {
  private apiKey?: string;
  private promptedForMissingKey = false;

  async sendHeartbeat(heartbeat: WakaTimeHeartbeat): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      await this.promptForApiKey();
      return;
    }

    const response = await fetch(
      "https://wakatime.com/api/v1/users/current/heartbeats",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(apiKey)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(heartbeat),
      },
    );

    if (!response.ok) {
      ztoolkit.log("Failed to send WakaTime heartbeat", response.status);
      if (response.status === 401 || response.status === 403) {
        this.apiKey = undefined;
      }
    }
  }

  async getApiKey(): Promise<string | undefined> {
    if (this.apiKey) {
      return this.apiKey;
    }

    const cfgApiKey = await this.readApiKeyFromConfig();
    if (cfgApiKey) {
      this.apiKey = cfgApiKey;
      return cfgApiKey;
    }

    const prefApiKey = `${getPref("apiKey") || ""}`.trim();
    if (prefApiKey) {
      this.apiKey = prefApiKey;
      return prefApiKey;
    }

    return undefined;
  }

  async promptForApiKey(): Promise<void> {
    if (this.promptedForMissingKey) {
      return;
    }

    this.promptedForMissingKey = true;
    const win = Zotero.getMainWindow();
    const apiKey = win.prompt(
      "WakaTime API key was not found in ~/.wakatime.cfg. Enter a fallback API key:",
      "",
    );

    if (apiKey?.trim()) {
      setPref("apiKey", apiKey.trim());
      this.apiKey = apiKey.trim();
      this.promptedForMissingKey = false;
    }
  }

  private async readApiKeyFromConfig(): Promise<string | undefined> {
    try {
      const homeDir = this.getHomeDir();
      if (!homeDir) {
        return undefined;
      }

      const configText = await IOUtils.readUTF8(
        PathUtils.join(homeDir, ".wakatime.cfg"),
      );
      return this.parseApiKey(configText);
    } catch (e) {
      ztoolkit.log("Unable to read ~/.wakatime.cfg", e);
      return undefined;
    }
  }

  private getHomeDir(): string | undefined {
    try {
      const file = Services.dirsvc.get(
        "Home",
        Components.interfaces.nsIFile,
      ) as nsIFile;
      return file.path;
    } catch (e) {
      ztoolkit.log("Unable to resolve home directory", e);
      return undefined;
    }
  }

  private parseApiKey(configText: string): string | undefined {
    for (const line of configText.split(/\r?\n/)) {
      const match = line.match(/^\s*api_key\s*=\s*(.+?)\s*$/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }
}
