import { createInterface, Interface } from 'readline';
import { SecureLogger } from './secure-logger.js';

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes: string;
  tarballUrl: string;
  lastChecked: Date;
}

export class ConsolePrompter {
  private rl: Interface | null = null;
  private promptTimeout: number;

  constructor() {
    this.promptTimeout = parseInt(process.env.VERSION_CHECK_PROMPT_TIMEOUT || '5', 10) * 1000;
  }

  /**
   * Prompt user for update confirmation with timeout
   */
  async promptForUpdate(versionInfo: VersionInfo): Promise<boolean> {
    // Don't prompt if not a TTY (automated environments)
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      SecureLogger.logDebug('Non-interactive environment detected, skipping update prompt');
      return false;
    }

    // Don't prompt if no update is available
    if (!versionInfo.updateAvailable) {
      return false;
    }

    try {
      this.displayUpdateNotification(versionInfo);
      return await this.askUserConfirmation();
    } catch (error) {
      SecureLogger.logError('Failed to prompt for update', error);
      return false;
    }
  }

  /**
   * Display update notification without prompting
   */
  displayUpdateAvailable(versionInfo: VersionInfo): void {
    if (!versionInfo.updateAvailable) {
      return;
    }

    console.log(`\n🔔 Update available: v${versionInfo.current} → v${versionInfo.latest}`);
    console.log('   Use the health endpoint or restart to check for updates again.\n');
  }

  private displayUpdateNotification(versionInfo: VersionInfo): void {
    console.log(`🔔 Update available: v${versionInfo.current} → v${versionInfo.latest}`);
  }

  private async askUserConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        console.log('\n⏰ Update prompt timed out, continuing without update...');
        this.cleanup();
        resolve(false);
      }, this.promptTimeout);

      // Ask the question
      this.rl.question('🤔 Would you like to update now? (y/N): ', (answer) => {
        clearTimeout(timeoutHandle);
        this.cleanup();
        
        const normalizedAnswer = answer.trim().toLowerCase();
        const shouldUpdate = normalizedAnswer === 'y' || normalizedAnswer === 'yes';
        
        if (shouldUpdate) {
          console.log('✅ Starting update process...');
        } else {
          console.log('⏭️  Update skipped, continuing with current version...');
        }
        
        resolve(shouldUpdate);
      });

      // Handle Ctrl+C gracefully
      this.rl.on('SIGINT', () => {
        clearTimeout(timeoutHandle);
        console.log('\n🛑 Update prompt cancelled, continuing without update...');
        this.cleanup();
        resolve(false);
      });
    });
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Display startup update check results
   */
  displayStartupUpdateCheck(versionInfo: VersionInfo): void {
    const isEnabled = process.env.VERSION_CHECK_ON_STARTUP !== 'false';
    
    if (!isEnabled) {
      return;
    }

    if (versionInfo.updateAvailable) {
      this.displayUpdateAvailable(versionInfo);
    } else {
      // Only log if debug mode is enabled
      if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
        console.log(`✅ You're running the latest version (v${versionInfo.current})`);
      }
    }
  }

  /**
   * Display interactive update prompt during startup
   */
  async displayStartupUpdatePrompt(versionInfo: VersionInfo): Promise<boolean> {
    const isEnabled = process.env.VERSION_CHECK_ON_STARTUP !== 'false';
    const isInteractive = process.env.VERSION_CHECK_INTERACTIVE === 'true';
    
    if (!isEnabled || !isInteractive) {
      this.displayStartupUpdateCheck(versionInfo);
      return false;
    }

    return this.promptForUpdate(versionInfo);
  }
}

export const consolePrompter = new ConsolePrompter();
