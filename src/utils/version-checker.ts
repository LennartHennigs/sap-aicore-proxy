import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SecureLogger } from './secure-logger.js';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  tarball_url: string;
  published_at: string;
  prerelease: boolean;
}

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes: string;
  tarballUrl: string;
  lastChecked: Date;
}

interface VersionCache {
  versionInfo: VersionInfo | null;
  cacheTimestamp: number;
}

export class VersionChecker {
  private cacheFile: string;
  private cacheValidHours: number;
  private githubRepo: string;
  private currentVersion: string;
  private includePreReleases: boolean;

  constructor() {
    this.cacheFile = join(process.cwd(), 'version-check-cache.json');
    this.cacheValidHours = parseInt(process.env.VERSION_CHECK_CACHE_HOURS || '24', 10);
    this.githubRepo = 'LennartHennigs/sap-aicore-proxy';
    this.includePreReleases = process.env.VERSION_CHECK_INCLUDE_PRERELEASES === 'true';
    
    // Initialize with default, will be read fresh each time it's needed
    this.currentVersion = '0.0.0';
  }

  /**
   * Get current version from package.json (reads fresh each time)
   */
  private getCurrentVersion(): string {
    try {
      const packagePath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      return packageJson.version;
    } catch (error) {
      SecureLogger.logError('Failed to read current version from package.json', error);
      return '0.0.0';
    }
  }

  /**
   * Check for updates, using cache if still valid
   */
  async checkForUpdates(): Promise<VersionInfo> {
    try {
      // Try to load from cache first
      const cachedInfo = this.loadFromCache();
      const currentVersion = this.getCurrentVersion();
      
      // Cache is valid if:
      // 1. Cache exists and is time-valid, AND
      // 2. Current version hasn't changed since cache was created
      if (cachedInfo && this.isCacheValid(cachedInfo.cacheTimestamp) && 
          cachedInfo.versionInfo?.current === currentVersion) {
        SecureLogger.logDebug('Using cached version information');
        return cachedInfo.versionInfo!;
      }
      
      // If version changed, log the change
      if (cachedInfo?.versionInfo?.current && cachedInfo.versionInfo.current !== currentVersion) {
        SecureLogger.logDebug(`Version changed from ${cachedInfo.versionInfo.current} to ${currentVersion}, invalidating cache`);
      }

      // Cache is invalid or doesn't exist, fetch from GitHub
      SecureLogger.logDebug('Fetching latest version information from GitHub');
      const latestRelease = await this.fetchLatestRelease();
      const versionInfo: VersionInfo = {
        current: currentVersion,
        latest: this.cleanVersion(latestRelease.tag_name),
        updateAvailable: this.compareVersions(currentVersion, this.cleanVersion(latestRelease.tag_name)),
        releaseUrl: latestRelease.html_url,
        releaseNotes: this.formatReleaseNotes(latestRelease.body),
        tarballUrl: latestRelease.tarball_url,
        lastChecked: new Date()
      };

      // Save to cache
      this.saveToCache(versionInfo);
      
      return versionInfo;
    } catch (error) {
      SecureLogger.logError('Failed to check for updates', error);
      
      // Return cached info if available, even if expired
      const cachedInfo = this.loadFromCache();
      if (cachedInfo?.versionInfo) {
        SecureLogger.logDebug('Using expired cache due to fetch error');
        return cachedInfo.versionInfo;
      }
      
      // Return default info
      const currentVersion = this.getCurrentVersion();
      return {
        current: currentVersion,
        latest: currentVersion,
        updateAvailable: false,
        releaseUrl: '',
        releaseNotes: 'Unable to check for updates',
        tarballUrl: '',
        lastChecked: new Date()
      };
    }
  }

  /**
   * Get version info from cache only (for health endpoint)
   */
  getCachedVersionInfo(): VersionInfo | null {
    const cached = this.loadFromCache();
    return cached?.versionInfo || null;
  }

  /**
   * Force refresh version information
   */
  async forceRefresh(): Promise<VersionInfo> {
    // Delete cache file to force refresh
    try {
      if (existsSync(this.cacheFile)) {
        require('fs').unlinkSync(this.cacheFile);
      }
    } catch (error) {
      // Ignore cache deletion errors
    }
    
    return this.checkForUpdates();
  }

  private async fetchLatestRelease(): Promise<GitHubRelease> {
    const url = `https://api.github.com/repos/${this.githubRepo}/releases/latest`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': `sap-aicore-proxy/${this.getCurrentVersion()}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        // 10 second timeout
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
      }

      const release: GitHubRelease = await response.json();
      
      // Skip pre-releases unless explicitly enabled
      if (release.prerelease && !this.includePreReleases) {
        throw new Error('Latest release is a pre-release and pre-releases are disabled');
      }

      return release;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('GitHub API request timed out');
      }
      throw error;
    }
  }

  private compareVersions(current: string, latest: string): boolean {
    try {
      const currentParts = this.cleanVersion(current).split('.').map(Number);
      const latestParts = this.cleanVersion(latest).split('.').map(Number);
      
      // Pad arrays to same length
      const maxLength = Math.max(currentParts.length, latestParts.length);
      while (currentParts.length < maxLength) currentParts.push(0);
      while (latestParts.length < maxLength) latestParts.push(0);
      
      // Compare each part
      for (let i = 0; i < maxLength; i++) {
        if (latestParts[i] > currentParts[i]) {
          return true; // Update available
        } else if (latestParts[i] < currentParts[i]) {
          return false; // Current is newer
        }
      }
      
      return false; // Versions are equal
    } catch (error) {
      SecureLogger.logError('Version comparison failed', error);
      return false;
    }
  }

  private cleanVersion(version: string): string {
    // Remove 'v' prefix and any suffixes like '-beta'
    return version.replace(/^v/, '').split('-')[0];
  }

  private formatReleaseNotes(body: string): string {
    if (!body) return 'No release notes available';
    
    // Limit length and clean up markdown
    const maxLength = 300;
    let notes = body.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '•').trim();
    
    if (notes.length > maxLength) {
      notes = notes.substring(0, maxLength) + '...';
    }
    
    return notes;
  }

  private loadFromCache(): VersionCache | null {
    try {
      if (!existsSync(this.cacheFile)) {
        return null;
      }
      
      const cacheData = readFileSync(this.cacheFile, 'utf8');
      const cache: VersionCache = JSON.parse(cacheData);
      
      // Validate cache structure
      if (!cache.versionInfo || !cache.cacheTimestamp) {
        return null;
      }
      
      return cache;
    } catch (error) {
      SecureLogger.logError('Failed to load version cache', error);
      return null;
    }
  }

  private saveToCache(versionInfo: VersionInfo): void {
    try {
      const cache: VersionCache = {
        versionInfo,
        cacheTimestamp: Date.now()
      };
      
      writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2), 'utf8');
      SecureLogger.logDebug('Version information cached successfully');
    } catch (error) {
      SecureLogger.logError('Failed to save version cache', error);
    }
  }

  private isCacheValid(cacheTimestamp: number): boolean {
    const cacheAgeMs = Date.now() - cacheTimestamp;
    const cacheValidMs = this.cacheValidHours * 60 * 60 * 1000;
    return cacheAgeMs < cacheValidMs;
  }
}

export const versionChecker = new VersionChecker();
