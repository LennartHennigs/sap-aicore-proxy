import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SecureLogger } from '../utils/secure-logger.js';

export class ApiKeyManager {
  private static readonly API_KEY_FILE = '.env.apikey';
  private static readonly API_KEY_PREFIX = 'sk-proj-';
  private static readonly KEY_LENGTH = 32; // 32 bytes = 256 bits
  
  private static apiKey: string | null = null;

  /**
   * Generate a new OpenAI-compatible API key
   * Format: sk-proj-[32 random characters in base64url]
   */
  private static generateApiKey(): string {
    const randomData = randomBytes(this.KEY_LENGTH);
    const base64String = randomData.toString('base64url');
    return `${this.API_KEY_PREFIX}${base64String}`;
  }

  /**
   * Validate API key format
   */
  private static isValidApiKeyFormat(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    
    // Check prefix
    if (!key.startsWith(this.API_KEY_PREFIX)) {
      return false;
    }
    
    // Check total length (prefix + 43 chars for base64url of 32 bytes)
    const expectedLength = this.API_KEY_PREFIX.length + 43;
    if (key.length !== expectedLength) {
      return false;
    }
    
    // Check characters after prefix are valid base64url
    const keyPart = key.substring(this.API_KEY_PREFIX.length);
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;
    return base64urlRegex.test(keyPart);
  }

  /**
   * Load API key from file
   */
  private static loadApiKeyFromFile(): string | null {
    try {
      if (!existsSync(this.API_KEY_FILE)) {
        return null;
      }
      
      const content = readFileSync(this.API_KEY_FILE, 'utf-8').trim();
      if (!content) {
        return null;
      }
      
      // Parse simple key=value format
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('API_KEY=')) {
          const key = trimmedLine.substring('API_KEY='.length).replace(/^["']|["']$/g, '');
          if (this.isValidApiKeyFormat(key)) {
            return key;
          }
        }
      }
      
      return null;
    } catch (error) {
      SecureLogger.logError('API key file read', error);
      return null;
    }
  }

  /**
   * Save API key to file
   */
  private static saveApiKeyToFile(apiKey: string): boolean {
    try {
      const content = `# SAP AI Core Proxy API Key
# This file is auto-generated. Do not modify manually.
# Keep this file secure and do not commit to version control.

API_KEY="${apiKey}"
`;
      
      writeFileSync(this.API_KEY_FILE, content, { 
        mode: 0o600, // Read/write for owner only
        encoding: 'utf-8' 
      });
      
      SecureLogger.logSecurityEvent('API key generated', 'New API key saved to file');
      return true;
    } catch (error) {
      SecureLogger.logError('API key file write', error);
      return false;
    }
  }

  /**
   * Initialize API key system - load existing or generate new
   */
  public static initialize(): string {
    if (this.apiKey) {
      return this.apiKey;
    }

    // Try to load existing key
    const existingKey = this.loadApiKeyFromFile();
    if (existingKey) {
      this.apiKey = existingKey;
      SecureLogger.logSecurityEvent('API key loaded', 'Existing API key loaded from file');
      return this.apiKey;
    }

    // Generate new key if none exists
    const newKey = this.generateApiKey();
    if (this.saveApiKeyToFile(newKey)) {
      this.apiKey = newKey;
      SecureLogger.logSecurityEvent('API key initialized', 'New API key generated and saved');
      return this.apiKey;
    } else {
      throw new Error('Failed to save API key to file. Check file system permissions.');
    }
  }

  /**
   * Get the current API key (initialize if needed)
   */
  public static getApiKey(): string {
    if (!this.apiKey) {
      return this.initialize();
    }
    return this.apiKey;
  }

  /**
   * Validate an incoming API key using constant-time comparison
   */
  public static validateApiKey(providedKey: string): boolean {
    if (!providedKey || typeof providedKey !== 'string') {
      return false;
    }

    const actualKey = this.getApiKey();
    
    // Constant-time comparison to prevent timing attacks
    if (providedKey.length !== actualKey.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < actualKey.length; i++) {
      result |= actualKey.charCodeAt(i) ^ providedKey.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Get a masked version of the API key for logging
   */
  public static getMaskedApiKey(): string {
    const key = this.getApiKey();
    if (key.length <= 12) {
      return key.substring(0, 8) + '****';
    }
    return key.substring(0, 12) + '****' + key.substring(key.length - 4);
  }

  /**
   * Regenerate API key (for security purposes)
   */
  public static regenerateApiKey(): string {
    const newKey = this.generateApiKey();
    if (this.saveApiKeyToFile(newKey)) {
      this.apiKey = newKey;
      SecureLogger.logSecurityEvent('API key regenerated', 'API key regenerated successfully');
      return this.apiKey;
    } else {
      throw new Error('Failed to save new API key to file');
    }
  }
}
