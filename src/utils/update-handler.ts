import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, existsSync, mkdirSync, rmSync, createReadStream, accessSync, constants, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import { extract } from 'tar';
import { SecureLogger } from './secure-logger.js';

const execAsync = promisify(exec);

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes: string;
  tarballUrl: string;
  lastChecked: Date;
}

interface UpdateResult {
  success: boolean;
  error?: string;
  newVersion?: string;
}

export class UpdateHandler {
  private tempDir: string;
  private preservedFiles: string[];

  constructor() {
    this.tempDir = join(process.cwd(), '.update-temp');
    
    // Files and directories to preserve during update
    this.preservedFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'logs/',
      'version-check-cache.json',
      'sap-aicore-proxy.pid',
      'node_modules/',
      '.git/',
      '.gitignore',
      'update-log.json'
    ];
  }

  /**
   * Perform the complete update process
   */
  async performUpdate(versionInfo: VersionInfo): Promise<UpdateResult> {
    console.log(`\n🔄 Starting update from v${versionInfo.current} to v${versionInfo.latest}...`);
    
    // Check if update is possible
    const canUpdate = this.canUpdate();
    if (!canUpdate.possible) {
      throw new Error(`Update not possible: ${canUpdate.reason}`);
    }
    
    try {
      // Step 1: Download the release
      console.log('📥 Downloading release...');
      const downloadPath = await this.downloadRelease(versionInfo.tarballUrl, versionInfo.latest);
      
      // Step 2: Extract to temporary directory
      console.log('📂 Extracting files...');
      await this.extractRelease(downloadPath);
      
      // Step 3: Backup current version (simple approach)
      console.log('💾 Creating backup...');
      await this.createBackup();
      
      // Step 4: Replace files
      console.log('🔄 Updating files...');
      await this.replaceFiles();
      
      // Step 5: Update dependencies
      console.log('📦 Updating dependencies...');
      await this.updateDependencies();
      
      // Step 6: Cleanup
      console.log('🧹 Cleaning up...');
      await this.cleanup();
      
      console.log(`✅ Update completed successfully! New version: v${versionInfo.latest}`);
      console.log('🔄 Restarting server...');
      
      // Step 7: Restart (this will terminate the current process)
      await this.restartServer();
      
      return {
        success: true,
        newVersion: versionInfo.latest
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Update failed: ${errorMessage}`);
      SecureLogger.logError('Update process failed', error);
      
      // Attempt rollback
      try {
        console.log('🔙 Attempting to restore backup...');
        await this.rollback();
        console.log('✅ Rollback completed');
      } catch (rollbackError) {
        console.error('❌ Rollback also failed:', rollbackError);
        SecureLogger.logError('Rollback failed', rollbackError);
      }
      
      await this.cleanup();
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private async downloadRelease(tarballUrl: string, version: string): Promise<string> {
    const filename = `sap-aicore-proxy-${version}.tar.gz`;
    const downloadPath = join(this.tempDir, filename);
    
    // Ensure temp directory exists
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
    
    try {
      const response = await fetch(tarballUrl, {
        headers: {
          'User-Agent': 'sap-aicore-proxy-updater'
        },
        // 60 second timeout for download
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body received');
      }
      
      const fileStream = createWriteStream(downloadPath);
      await pipeline(Readable.fromWeb(response.body as any), fileStream);
      
      SecureLogger.logDebug(`Release downloaded to ${downloadPath}`);
      return downloadPath;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Download timed out');
      }
      throw error;
    }
  }

  private async extractRelease(tarballPath: string): Promise<void> {
    const extractPath = join(this.tempDir, 'extracted');
    
    // Clean extract directory
    if (existsSync(extractPath)) {
      rmSync(extractPath, { recursive: true, force: true });
    }
    mkdirSync(extractPath, { recursive: true });
    
    try {
      // Extract tarball
      await pipeline(
        createReadStream(tarballPath),
        createGunzip(),
        extract({ cwd: extractPath, strip: 1 }) // strip: 1 removes the top-level directory
      );
      
      SecureLogger.logDebug(`Release extracted to ${extractPath}`);
    } catch (error) {
      throw new Error(`Failed to extract release: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createBackup(): Promise<void> {
    const backupDir = join(this.tempDir, 'backup');
    
    try {
      // Comprehensive backup approach - copy all critical files and directories
      const criticalFiles = [
        'package.json',
        'package-lock.json',
        'src/',
        'scripts/',
        'tsconfig.json',
        'config/',
        'docs/',
        'README.md',
        'CHANGELOG.md',
        'HOW_TO_INSTALL.md'
      ];
      
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }
      
      // Create a backup timestamp file
      const backupInfo = {
        timestamp: new Date().toISOString(),
        version: this.getCurrentVersion(),
        files: []
      };
      
      for (const file of criticalFiles) {
        const sourcePath = join(process.cwd(), file);
        if (existsSync(sourcePath)) {
          const targetPath = join(backupDir, file);
          
          // Ensure target directory exists
          const targetDir = join(targetPath, '..');
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
          
          await execAsync(`cp -r "${sourcePath}" "${targetPath}"`);
          backupInfo.files.push(file);
          console.log(`   ✓ Backed up ${file}`);
        }
      }
      
      // Save backup info
      writeFileSync(
        join(backupDir, 'backup-info.json'),
        JSON.stringify(backupInfo, null, 2)
      );
      
      SecureLogger.logDebug(`Backup created successfully with ${backupInfo.files.length} items`);
    } catch (error) {
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async replaceFiles(): Promise<void> {
    const extractPath = join(this.tempDir, 'extracted');
    
    try {
      // Copy new files, excluding preserved files
      const { stdout } = await execAsync(`ls -la "${extractPath}"`);
      SecureLogger.logDebug(`Files in extracted directory: ${stdout}`);
      
      // Use rsync for selective copying (excluding preserved files)
      const excludeArgs = this.preservedFiles.map(file => `--exclude="${file}"`).join(' ');
      const rsyncCommand = `rsync -av ${excludeArgs} "${extractPath}/" "${process.cwd()}/"`;
      
      await execAsync(rsyncCommand);
      SecureLogger.logDebug('Files replaced successfully');
      
    } catch (error) {
      throw new Error(`Failed to replace files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async updateDependencies(): Promise<void> {
    try {
      console.log('   Installing/updating npm dependencies...');
      
      // Run npm install WITHOUT production flag to include dev dependencies
      // tsx is a dev dependency but required for the server to run
      const { stdout, stderr } = await execAsync('npm install', {
        cwd: process.cwd(),
        timeout: 120000 // 2 minute timeout
      });
      
      if (stderr && !stderr.includes('warn')) {
        SecureLogger.logDebug(`npm install stderr: ${stderr}`);
      }
      
      SecureLogger.logDebug('Dependencies updated successfully');
      
    } catch (error) {
      // Don't fail the entire update for dependency issues
      console.warn('⚠️  Warning: Failed to update dependencies, but update will continue');
      SecureLogger.logError('Dependency update failed (non-fatal)', error);
    }
  }

  private async rollback(): Promise<void> {
    const backupDir = join(this.tempDir, 'backup');
    
    if (!existsSync(backupDir)) {
      throw new Error('No backup found for rollback');
    }
    
    try {
      // Restore from backup
      await execAsync(`cp -r "${backupDir}"/* "${process.cwd()}/"`);
      SecureLogger.logDebug('Rollback completed');
    } catch (error) {
      throw new Error(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (existsSync(this.tempDir)) {
        rmSync(this.tempDir, { recursive: true, force: true });
      }
      SecureLogger.logDebug('Cleanup completed');
    } catch (error) {
      // Don't fail for cleanup errors
      SecureLogger.logError('Cleanup failed (non-fatal)', error);
    }
  }

  private async restartServer(): Promise<void> {
    console.log('🔄 Server will restart in 2 seconds...');
    console.log('📝 Note: After update, you may need to manually restart with: npm start');
    
    // Give a moment for the message to display
    setTimeout(() => {
      try {
        // Try to restart using npm script if available
        const npm = spawn('npm', ['start'], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd()
        });
        npm.unref();
        
        console.log('🚀 New server instance started');
      } catch (error) {
        console.log('⚠️  Manual restart required - run: npm start');
      }
      
      // Exit current process
      process.exit(0);
    }, 2000);
  }

  /**
   * Get current version from package.json
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
   * Check if update is possible (system requirements)
   */
  canUpdate(): { possible: boolean; reason?: string } {
    // Check if we have required tools
    const requiredTools = ['cp', 'rsync', 'npm'];
    
    for (const tool of requiredTools) {
      if (!this.isToolAvailable(tool)) {
        return {
          possible: false,
          reason: `Required tool '${tool}' not found`
        };
      }
    }
    
    // Check if we have write permissions
    try {
      accessSync(process.cwd(), constants.W_OK);
    } catch (error) {
      return {
        possible: false,
        reason: 'No write permission to current directory'
      };
    }
    
    return { possible: true };
  }

  /**
   * Check if a system tool is available
   */
  private isToolAvailable(tool: string): boolean {
    try {
      // Try using 'which' command first
      execSync(`which ${tool}`, { stdio: 'pipe', encoding: 'utf8' });
      return true;
    } catch (error) {
      // If 'which' fails, try common system paths
      const commonPaths = ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];
      
      for (const path of commonPaths) {
        try {
          const toolPath = `${path}/${tool}`;
          if (existsSync(toolPath)) {
            // Double-check it's executable
            try {
              accessSync(toolPath, constants.X_OK);
              return true;
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Final attempt: try to execute the tool directly
      try {
        execSync(`${tool} --version 2>/dev/null || ${tool} --help 2>/dev/null || echo "tool exists"`, { 
          stdio: 'pipe', 
          timeout: 3000 
        });
        return true;
      } catch (finalError) {
        return false;
      }
    }
  }
}

export const updateHandler = new UpdateHandler();
