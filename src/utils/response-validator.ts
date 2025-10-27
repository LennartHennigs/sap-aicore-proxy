import { SecureLogger } from './secure-logger.js';
import { config } from '../config/app-config.js';
import type { DirectApiResponse } from '../strategies/ModelStrategy.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface ValidationResult {
  isValid: boolean;
  corrected: boolean;
  issues: string[];
  correctedResponse?: DirectApiResponse;
  correlationId?: string;
}

export interface StreamChunkValidationResult {
  isValid: boolean;
  corrected: boolean;
  issues: string[];
  correctedChunk?: any;
  correlationId?: string;
}

export interface LLMResponseLog {
  correlationId: string;
  timestamp: string;
  model: string;
  requestType: 'streaming' | 'non-streaming';
  
  // Raw response tracking
  rawResponse: any;
  rawResponseSize: number;
  rawResponseType: string;
  
  // Processing steps
  processingSteps: string[];
  transformations: Array<{
    step: string;
    before: any;
    after: any;
    reason: string;
  }>;
  
  // Final response
  finalResponse: string;
  finalResponseSize: number;
  
  // Validation results
  issues: string[];
  corrected: boolean;
  malformationTypes: string[];
  
  // Request context
  prompt: string;
  promptSize: number;
  
  // Performance metrics
  processingTimeMs: number;
  
  // Error correlation
  errorPatterns: string[];
  suspiciousPatterns: string[];
}

export class ResponseValidator {
  private static instance: ResponseValidator;
  private static initialized = false;

  private constructor() {}

  static getInstance(): ResponseValidator {
    if (!ResponseValidator.instance) {
      ResponseValidator.instance = new ResponseValidator();
      
      // Log initialization status once
      if (!ResponseValidator.initialized) {
        ResponseValidator.logInitializationStatus();
        ResponseValidator.initialized = true;
      }
    }
    return ResponseValidator.instance;
  }

  /**
   * Log the initialization status of response analysis logging
   */
  private static logInitializationStatus(): void {
    const isEnabled = config.logging.responseAnalysis.enabled;
    const logAllResponses = config.logging.responseAnalysis.logAllResponses;
    const logFile = config.logging.responseAnalysis.logFile;

    console.log('🔍 Response Analysis Logging Configuration:');
    
    if (isEnabled) {
      console.log('  ✅ Status: ENABLED');
      console.log(`  📝 Mode: ${logAllResponses ? 'All responses' : 'Problematic responses only'}`);
      console.log(`  📁 Log file: ${logFile}`);
      
      // Test if log directory is writable
      try {
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
          console.log('  ⚠️  Log directory does not exist (will be created on first log)');
        }
      } catch (error) {
        console.log('  ⚠️  Warning: Log directory may not be accessible');
      }
    } else {
      console.log('  ❌ Status: DISABLED');
      console.log('  ℹ️  To enable: Set RESPONSE_ANALYSIS_LOGGING=true in .env');
    }
    
    console.log(''); // Add spacing
  }

  /**
   * Validate and correct a non-streaming API response
   */
  validateAndCorrectResponse(response: any, modelName: string, prompt?: string): ValidationResult {
    const startTime = Date.now();
    const correlationId = randomUUID();
    const issues: string[] = [];
    let corrected = false;
    let correctedResponse: DirectApiResponse | undefined;

    // Create comprehensive LLM response log
    const llmLog: LLMResponseLog = {
      correlationId,
      timestamp: new Date().toISOString(),
      model: modelName,
      requestType: 'non-streaming',
      rawResponse: this.sanitizeForLogging(response),
      rawResponseSize: this.calculateResponseSize(response),
      rawResponseType: this.determineResponseType(response),
      processingSteps: [],
      transformations: [],
      finalResponse: '',
      finalResponseSize: 0,
      issues: [],
      corrected: false,
      malformationTypes: [],
      prompt: this.truncateForLogging(prompt || 'No prompt provided'),
      promptSize: (prompt || '').length,
      processingTimeMs: 0,
      errorPatterns: [],
      suspiciousPatterns: []
    };

    llmLog.processingSteps.push('Starting response validation');

    // Handle raw SAP AI Core response
    const originalResponse = { ...response };
    const parsedResponse = this.ensureValidDirectApiResponse(response);
    
    if (JSON.stringify(originalResponse) !== JSON.stringify(parsedResponse)) {
      llmLog.transformations.push({
        step: 'Response structure normalization',
        before: this.sanitizeForLogging(originalResponse),
        after: this.sanitizeForLogging(parsedResponse),
        reason: 'Converted raw response to DirectApiResponse format'
      });
    }
    
    llmLog.processingSteps.push('Response structure normalized');

    // Check for empty or invalid text content
    if (!parsedResponse.text || typeof parsedResponse.text !== 'string') {
      issues.push('Response text is empty or invalid');
      llmLog.malformationTypes.push('empty_or_invalid_text');
      
      const originalText = parsedResponse.text;
      parsedResponse.text = this.generateFallbackText(response, modelName);
      corrected = true;
      
      llmLog.transformations.push({
        step: 'Empty text correction',
        before: originalText,
        after: parsedResponse.text,
        reason: 'Generated fallback text for empty/invalid response'
      });
    }

    // Check for whitespace-only content
    if (parsedResponse.text.trim().length === 0) {
      issues.push('Response contains only whitespace');
      llmLog.malformationTypes.push('whitespace_only');
      
      const originalText = parsedResponse.text;
      parsedResponse.text = this.generateFallbackText(response, modelName);
      corrected = true;
      
      llmLog.transformations.push({
        step: 'Whitespace-only correction',
        before: originalText,
        after: parsedResponse.text,
        reason: 'Replaced whitespace-only content with fallback text'
      });
    }

    // Check for malformed JSON in text content (common SAP AI Core issue)
    if (this.isLikelyMalformedJson(parsedResponse.text)) {
      issues.push('Response contains malformed JSON');
      llmLog.malformationTypes.push('malformed_json');
      
      const originalText = parsedResponse.text;
      parsedResponse.text = this.fixMalformedJson(parsedResponse.text);
      corrected = true;
      
      llmLog.transformations.push({
        step: 'JSON malformation fix',
        before: this.truncateForLogging(originalText),
        after: this.truncateForLogging(parsedResponse.text),
        reason: 'Fixed malformed JSON structure'
      });
    }

    // Check for reasoning-only responses (similar to Cline issue)
    if (this.isReasoningOnlyResponse(parsedResponse.text)) {
      issues.push('Response contains only reasoning, no assistant message');
      llmLog.malformationTypes.push('reasoning_only');
      
      const originalText = parsedResponse.text;
      parsedResponse.text = this.extractUsefulContentFromReasoning(parsedResponse.text);
      corrected = true;
      
      llmLog.transformations.push({
        step: 'Reasoning-only extraction',
        before: this.truncateForLogging(originalText),
        after: this.truncateForLogging(parsedResponse.text),
        reason: 'Extracted useful content from reasoning-only response'
      });
    }

    // Ensure usage information is present
    if (!parsedResponse.usage || typeof parsedResponse.usage !== 'object') {
      parsedResponse.usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      };
      corrected = true;
      llmLog.processingSteps.push('Added missing usage information');
    }

    // Detect suspicious patterns
    llmLog.suspiciousPatterns = this.detectSuspiciousPatterns(parsedResponse.text);
    llmLog.errorPatterns = this.detectErrorPatterns(response, parsedResponse.text);

    const isValid = issues.length === 0;
    
    if (corrected || !isValid) {
      correctedResponse = parsedResponse;
      SecureLogger.logDebug(`Response validation for ${modelName}: ${issues.length} issues found, corrected: ${corrected}`);
    }

    // Finalize log entry
    llmLog.finalResponse = this.truncateForLogging(parsedResponse.text);
    llmLog.finalResponseSize = parsedResponse.text.length;
    llmLog.issues = issues;
    llmLog.corrected = corrected;
    llmLog.processingTimeMs = Date.now() - startTime;
    llmLog.processingSteps.push('Response validation completed');

    // Log comprehensive LLM response data
    this.logLLMResponse(llmLog);

    return {
      isValid,
      corrected,
      issues,
      correctedResponse,
      correlationId
    };
  }

  /**
   * Validate and correct a streaming chunk
   */
  validateStreamChunk(chunk: any, modelName: string, prompt?: string): StreamChunkValidationResult {
    const issues: string[] = [];
    let corrected = false;
    let correctedChunk: any = { ...chunk };

    // Ensure chunk has required structure
    if (typeof correctedChunk !== 'object' || correctedChunk === null) {
      issues.push('Invalid chunk structure');
      correctedChunk = { delta: '', finished: false };
      corrected = true;
    }

    // Ensure delta property exists
    if (!('delta' in correctedChunk)) {
      issues.push('Missing delta property');
      correctedChunk.delta = '';
      corrected = true;
    }

    // Ensure delta is a string
    if (typeof correctedChunk.delta !== 'string') {
      issues.push('Delta is not a string');
      correctedChunk.delta = String(correctedChunk.delta || '');
      corrected = true;
    }

    // Ensure finished property exists and is boolean
    if (!('finished' in correctedChunk) || typeof correctedChunk.finished !== 'boolean') {
      correctedChunk.finished = false;
      corrected = true;
    }

    // Check for malformed delta content
    if (correctedChunk.delta && this.containsInvalidCharacters(correctedChunk.delta)) {
      issues.push('Delta contains invalid characters');
      correctedChunk.delta = this.sanitizeText(correctedChunk.delta);
      corrected = true;
    }

    const isValid = issues.length === 0;

    if (corrected && issues.length > 0) {
      SecureLogger.logDebug(`Stream chunk validation for ${modelName}: ${issues.length} issues found and corrected`);
    }

    // Log streaming chunk analysis (only when there are issues to avoid spam)
    if (issues.length > 0) {
      this.logResponseAnalysis({
        model: modelName,
        issues,
        corrected,
        original: chunk,
        final: correctedChunk.delta,
        prompt,
        isStreaming: true
      });
    }

    return {
      isValid,
      corrected,
      issues,
      correctedChunk: corrected ? correctedChunk : undefined
    };
  }

  /**
   * Ensure response has DirectApiResponse structure
   */
  private ensureValidDirectApiResponse(response: any): DirectApiResponse {
    if (this.isValidDirectApiResponse(response)) {
      return response;
    }

    // Try to extract text from various possible response formats
    let text = '';
    
    // OpenAI format
    if (response.choices?.[0]?.message?.content) {
      text = response.choices[0].message.content;
    }
    // Anthropic format
    else if (response.content?.[0]?.text) {
      text = response.content[0].text;
    }
    // Direct text response
    else if (response.text && typeof response.text === 'string') {
      text = response.text;
    }
    // Message content
    else if (response.message?.content) {
      text = response.message.content;
    }
    // Raw string response
    else if (typeof response === 'string') {
      text = response;
    }
    // Fallback
    else {
      text = 'No valid response content found';
    }

    return {
      success: true,
      text,
      usage: {
        promptTokens: response.usage?.prompt_tokens || response.usage?.promptTokens || 0,
        completionTokens: response.usage?.completion_tokens || response.usage?.completionTokens || 0,
        totalTokens: response.usage?.total_tokens || response.usage?.totalTokens || 0
      }
    };
  }

  /**
   * Check if response is already a valid DirectApiResponse
   */
  private isValidDirectApiResponse(response: any): response is DirectApiResponse {
    return (
      typeof response === 'object' &&
      response !== null &&
      typeof response.success === 'boolean' &&
      typeof response.text === 'string' &&
      typeof response.usage === 'object' &&
      response.usage !== null
    );
  }

  /**
   * Check if text looks like malformed JSON
   */
  private isLikelyMalformedJson(text: string): boolean {
    // Look for JSON-like patterns that might be malformed
    const jsonPatterns = [
      /^\s*\{[\s\S]*\}\s*$/, // Object-like
      /^\s*\[[\s\S]*\]\s*$/, // Array-like
    ];

    for (const pattern of jsonPatterns) {
      if (pattern.test(text)) {
        try {
          JSON.parse(text);
          return false; // Valid JSON
        } catch {
          return true; // Malformed JSON
        }
      }
    }

    return false;
  }

  /**
   * Attempt to fix malformed JSON
   */
  private fixMalformedJson(text: string): string {
    try {
      // Try to parse as-is first
      JSON.parse(text);
      return text; // Already valid
    } catch {
      // Common fixes for malformed JSON
      let fixed = text
        .replace(/,\s*}/g, '}') // Remove trailing commas in objects
        .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
        .replace(/:\s*'([^']*)'/g, ':"$1"') // Replace single quotes with double quotes
        .replace(/\n/g, '\\n') // Escape newlines
        .replace(/\t/g, '\\t'); // Escape tabs

      try {
        JSON.parse(fixed);
        return fixed;
      } catch {
        // If still invalid, extract text content or return safe fallback
        const textMatch = text.match(/"text"\s*:\s*"([^"]*)"/) || text.match(/'text'\s*:\s*'([^']*)'/) || text.match(/text\s*:\s*([^,}]+)/);
        if (textMatch) {
          return textMatch[1];
        }
        return 'Response contained malformed content that could not be parsed.';
      }
    }
  }

  /**
   * Check if response contains only reasoning (like Cline issue)
   */
  private isReasoningOnlyResponse(text: string): boolean {
    // Look for common reasoning patterns without actual assistant content
    const reasoningPatterns = [
      /^<thinking>[\s\S]*<\/thinking>\s*$/,
      /^I need to[\s\S]*$/i,
      /^Let me[\s\S]*$/i,
      /^First,[\s\S]*$/i,
      // SAP AI Core specific patterns
      /^Based on the context[\s\S]*$/i,
      /^Looking at the[\s\S]*$/i,
      /^Analyzing the[\s\S]*$/i,
      /^To answer this[\s\S]*$/i,
    ];

    return reasoningPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Extract useful content from reasoning-only responses
   */
  private extractUsefulContentFromReasoning(text: string): string {
    // Try to extract the main intent or convert reasoning to response
    const thinkingMatch = text.match(/<thinking>([\s\S]*)<\/thinking>/);
    if (thinkingMatch) {
      const thinking = thinkingMatch[1].trim();
      // Convert thinking to a response
      return `I understand you're asking about this. Let me help you with that. ${thinking.substring(0, 200)}${thinking.length > 200 ? '...' : ''}`;
    }

    // For other reasoning patterns, provide a generic helpful response
    return 'I understand your request. Let me help you with that. Could you please provide more specific details about what you need?';
  }

  /**
   * Generate fallback text for empty responses
   */
  private generateFallbackText(originalResponse: any, modelName: string): string {
    // Try to extract any meaningful content
    const possibleContent = [
      originalResponse?.message,
      originalResponse?.content,
      originalResponse?.output,
      originalResponse?.result,
      // SAP AI Core specific response fields
      originalResponse?.data?.content,
      originalResponse?.response?.text,
      originalResponse?.generated_text,
      originalResponse?.completion
    ].find(content => content && typeof content === 'string' && content.trim());

    if (possibleContent) {
      return possibleContent.trim();
    }

    // Check for SAP AI Core specific error patterns
    if (this.isSapAiCoreModel(modelName)) {
      return this.generateSapAiCoreFallback(originalResponse);
    }

    return `I apologize, but I received an empty response from the ${modelName} model. Could you please try rephrasing your request?`;
  }

  /**
   * Check if this is a SAP AI Core model
   */
  private isSapAiCoreModel(modelName: string): boolean {
    // Common SAP AI Core model patterns
    return modelName.includes('gpt') || 
           modelName.includes('claude') || 
           modelName.includes('llama') || 
           modelName.includes('gemma') ||
           modelName.includes('mistral') ||
           modelName.includes('phi') ||
           modelName.includes('qwen');
  }

  /**
   * Generate SAP AI Core specific fallback response
   */
  private generateSapAiCoreFallback(originalResponse: any): string {
    // Check for common SAP AI Core error indicators
    if (originalResponse?.error || originalResponse?.status === 'error') {
      return 'I encountered an issue processing your request. Please try again with a different approach.';
    }

    // Check for timeout or processing issues
    if (originalResponse?.status === 'timeout' || originalResponse?.message?.includes('timeout')) {
      return 'The request took too long to process. Please try with a shorter or simpler request.';
    }

    // Check for model capacity issues
    if (originalResponse?.message?.includes('capacity') || originalResponse?.message?.includes('busy')) {
      return 'The model is currently busy. Please try again in a moment.';
    }

    return 'I apologize, but I encountered an issue generating a response. Could you please rephrase your request?';
  }

  /**
   * Check if text contains invalid characters
   */
  private containsInvalidCharacters(text: string): boolean {
    // Check for control characters that might break parsing
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text);
  }

  /**
   * Sanitize text by removing invalid characters
   */
  private sanitizeText(text: string): string {
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Log response analysis data to file
   * CRITICAL: This must NEVER throw errors or break API calls
   */
  private logResponseAnalysis(data: {
    model: string;
    issues: string[];
    corrected: boolean;
    original: any;
    final: string;
    prompt?: string;
    isStreaming?: boolean;
  }): void {
    // Wrap everything in async to prevent blocking API calls
    setImmediate(() => {
      this.safeLogResponseAnalysis(data);
    });
  }

  /**
   * Safe logging implementation that never throws errors
   */
  private safeLogResponseAnalysis(data: {
    model: string;
    issues: string[];
    corrected: boolean;
    original: any;
    final: string;
    prompt?: string;
    isStreaming?: boolean;
  }): void {
    try {
      // Only log if enabled
      if (!config.logging.responseAnalysis.enabled) {
        return;
      }

      // Only log problematic responses if logAllResponses is false
      if (!config.logging.responseAnalysis.logAllResponses && data.issues.length === 0) {
        return;
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        model: data.model,
        issues: data.issues,
        corrected: data.corrected,
        original: this.sanitizeForLogging(data.original),
        final: data.final,
        prompt: data.prompt,
        isStreaming: data.isStreaming || false
      };

      // Validate log file path
      const logFile = config.logging.responseAnalysis.logFile;
      if (!logFile || typeof logFile !== 'string') {
        // Silently skip logging if path is invalid
        return;
      }

      // Ensure logs directory exists (with extensive error handling)
      const logDir = path.dirname(logFile);
      if (!this.ensureDirectoryExists(logDir)) {
        // Directory creation failed, skip logging silently
        return;
      }

      // Append to log file as JSONL (one JSON object per line)
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(logFile, logLine, 'utf8');
      
    } catch (error) {
      // Log error but NEVER let it propagate to break API calls
      try {
        SecureLogger.logError('Response analysis logging failed (non-critical)', error);
      } catch {
        // Even error logging failed - completely silent fallback
        console.error('Response analysis logging failed and error logging also failed');
      }
    }
  }

  /**
   * Safely ensure directory exists without throwing errors
   */
  private ensureDirectoryExists(dirPath: string): boolean {
    try {
      if (fs.existsSync(dirPath)) {
        return true;
      }
      
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch (error) {
      // Directory creation failed - return false to skip logging
      return false;
    }
  }

  /**
   * Calculate response size in bytes
   */
  private calculateResponseSize(response: any): number {
    try {
      return JSON.stringify(response).length;
    } catch {
      return String(response).length;
    }
  }

  /**
   * Determine the type of response received
   */
  private determineResponseType(response: any): string {
    if (typeof response === 'string') return 'string';
    if (Array.isArray(response)) return 'array';
    if (response === null) return 'null';
    if (typeof response === 'object') {
      // Check for specific API formats
      if (response.choices) return 'openai_format';
      if (response.content) return 'anthropic_format';
      if (response.text) return 'direct_text_format';
      if (response.message) return 'message_format';
      return 'object';
    }
    return typeof response;
  }

  /**
   * Truncate text for logging while preserving readability
   */
  private truncateForLogging(text: string, maxLength: number = 1000): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...[truncated]';
  }

  /**
   * Detect suspicious patterns in response text
   */
  private detectSuspiciousPatterns(text: string): string[] {
    const patterns: Array<{ name: string; regex: RegExp }> = [
      { name: 'contains_error_keywords', regex: /\b(error|exception|failed|timeout|invalid)\b/i },
      { name: 'contains_debugging_info', regex: /\b(stack trace|debug|console|log)\b/i },
      { name: 'contains_json_fragments', regex: /[\{\[\"].*[\}\]\"]/g },
      { name: 'contains_html_tags', regex: /<[^>]+>/g },
      { name: 'contains_xml_tags', regex: /<\/?[a-zA-Z][^>]*>/g },
      { name: 'contains_code_blocks', regex: /```[\s\S]*?```/g },
      { name: 'contains_function_calls', regex: /\w+\([^)]*\)/g },
      { name: 'unusually_short', regex: /^.{1,10}$/g },
      { name: 'unusually_repetitive', regex: /(.{10,})\1{3,}/g },
      { name: 'contains_raw_data', regex: /\b[A-Za-z0-9+/]{20,}={0,2}\b/g } // Base64-like patterns
    ];

    const detected: string[] = [];
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        detected.push(pattern.name);
      }
    }

    return detected;
  }

  /**
   * Detect error patterns in raw response and final text
   */
  private detectErrorPatterns(rawResponse: any, finalText: string): string[] {
    const patterns: string[] = [];

    // Check raw response structure
    if (rawResponse?.error) patterns.push('raw_response_contains_error');
    if (rawResponse?.status === 'error') patterns.push('raw_response_error_status');
    if (rawResponse?.message?.includes?.('error')) patterns.push('raw_response_error_message');

    // Check for HTTP error indicators
    if (rawResponse?.status >= 400) patterns.push('http_error_status');
    if (rawResponse?.statusText?.includes?.('Error')) patterns.push('http_error_status_text');

    // Check final text for error indicators
    if (finalText.toLowerCase().includes('apologize')) patterns.push('final_text_contains_apology');
    if (finalText.toLowerCase().includes('error')) patterns.push('final_text_contains_error');
    if (finalText.toLowerCase().includes('unable')) patterns.push('final_text_unable_to_process');
    if (finalText.toLowerCase().includes('try again')) patterns.push('final_text_suggests_retry');

    // Check for malformation indicators
    if (finalText.length === 0) patterns.push('empty_final_text');
    if (finalText.trim() !== finalText) patterns.push('final_text_has_whitespace_issues');
    if (this.isLikelyMalformedJson(finalText)) patterns.push('final_text_malformed_json');

    return patterns;
  }

  /**
   * Log comprehensive LLM response data
   */
  private logLLMResponse(llmLog: LLMResponseLog): void {
    // Wrap everything in async to prevent blocking API calls
    setImmediate(() => {
      this.safeLogLLMResponse(llmLog);
    });
  }

  /**
   * Safe comprehensive LLM response logging
   */
  private safeLogLLMResponse(llmLog: LLMResponseLog): void {
    try {
      // Only log if enabled
      if (!config.logging.responseAnalysis.enabled) {
        return;
      }

      // Only log problematic responses if logAllResponses is false
      if (!config.logging.responseAnalysis.logAllResponses && llmLog.issues.length === 0) {
        return;
      }

      // Validate log file path
      const logFile = config.logging.responseAnalysis.logFile;
      if (!logFile || typeof logFile !== 'string') {
        return;
      }

      // Ensure logs directory exists
      const logDir = path.dirname(logFile);
      if (!this.ensureDirectoryExists(logDir)) {
        return;
      }

      // Append to log file as JSONL (one JSON object per line)
      const logLine = JSON.stringify(llmLog) + '\n';
      fs.appendFileSync(logFile, logLine, 'utf8');
      
    } catch (error) {
      // Log error but NEVER let it propagate to break API calls
      try {
        SecureLogger.logError('LLM response logging failed (non-critical)', error);
      } catch {
        // Even error logging failed - completely silent fallback
        console.error('LLM response logging failed and error logging also failed');
      }
    }
  }

  /**
   * Sanitize data for logging (truncate very long strings)
   */
  private sanitizeForLogging(data: any): any {
    if (typeof data === 'string') {
      // Truncate very long strings to keep log files manageable
      return data.length > 2000 ? data.substring(0, 2000) + '...[truncated]' : data;
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeForLogging(value);
      }
      return sanitized;
    }
    
    return data;
  }
}

export const responseValidator = ResponseValidator.getInstance();
