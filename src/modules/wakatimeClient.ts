import { getPref, setPref } from "../utils/prefs";
import pkg from "../../package.json";

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

type WakaTimeStatusBarResponse = {
  data?: {
    grand_total?: {
      total_seconds?: number;
    };
  };
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

    const response = await Zotero.HTTP.request(
      "POST",
      `${this.getApiBaseUrl()}/users/current/heartbeats`,
      {
        headers: {
          Authorization: `Basic ${btoa(apiKey)}`,
          "Content-Type": "application/json",
          "User-Agent": this.getUserAgent(),
        },
        body: JSON.stringify(heartbeat),
        successCodes: false,
      },
    );

    if (response.status < 200 || response.status >= 300) {
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

  async getTodaySeconds(): Promise<number | undefined> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return undefined;
    }

    const response = await Zotero.HTTP.request(
      "GET",
      `${this.getApiBaseUrl()}/users/current/status_bar/today`,
      {
        headers: {
          Authorization: `Basic ${btoa(apiKey)}`,
          "User-Agent": this.getUserAgent(),
        },
        successCodes: false,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      ztoolkit.log("Failed to fetch WakaTime status bar", response.status);
      if (response.status === 401 || response.status === 403) {
        this.apiKey = undefined;
      }
      return undefined;
    }

    try {
      const payload = JSON.parse(
        response.responseText || "{}",
      ) as WakaTimeStatusBarResponse;
      return payload.data?.grand_total?.total_seconds;
    } catch (e) {
      ztoolkit.log("Unable to parse WakaTime status bar response", e);
      return undefined;
    }
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

  private getUserAgent(): string {
    const os = this.getOperatingSystem();
    return `wakatime/unset (${os}) zotero-wakatime/${pkg.version}`;
  }

  private getApiBaseUrl(): string {
    const fallback = "https://api.wakatime.com/api/v1";
    const apiBaseUrl = `${getPref("apiBaseUrl") || fallback}`.trim();
    return (apiBaseUrl || fallback).replace(/\/+$/, "");
  }

  private getOperatingSystem(): string {
    try {
      const os = Services.appinfo.OS || "unknown";
      const arch = Services.appinfo.XPCOMABI?.split("-").pop() || "unknown";
      return `${os.toLowerCase()}-${arch.toLowerCase()}`;
    } catch (e) {
      ztoolkit.log("Unable to resolve operating system", e);
      return "unknown";
    }
  }
}
