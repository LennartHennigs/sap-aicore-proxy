import type { ModelConfig } from '../models/model-router.js';
import type { ModelStrategy, RequestData, DirectApiResponse } from './ModelStrategy.js';
import { config } from '../config/app-config.js';

export class GeminiStrategy implements ModelStrategy {
  getName(): string {
    return 'GeminiStrategy';
  }

  buildRequest(baseUrl: string, modelConfig: ModelConfig, messages: any[]): RequestData {
    const deploymentUrl = `${baseUrl}${modelConfig.endpoint || config.models.defaults.gemini.endpoint}`;
    
    // Convert messages to Gemini format - use single contents object as per SAP AI Core format
    const allParts: any[] = [];
    
    // Process all messages and combine their parts (text-only)
    messages.forEach((message: any) => {
      if (typeof message.content === 'string') {
        allParts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        message.content.forEach((item: any) => {
          if (typeof item === 'string') {
            allParts.push({ text: item });
          } else if (item.type === 'text') {
            allParts.push({ text: item.text });
          } else if (item.type === 'image_url') {
            // Vision is disabled for Gemini - convert images to text placeholders
            allParts.push({ 
              text: '[Image was provided but Gemini vision support is disabled. Please use GPT-5 nano or Claude for image analysis.]' 
            });
          } else {
            allParts.push({ text: JSON.stringify(item) });
          }
        });
      } else {
        allParts.push({ text: JSON.stringify(message.content) });
      }
    });
    
    // Use the format from SAP AI Core: single contents object with role and parts
    const requestBody = {
      contents: {
        role: "user",
        parts: allParts
      },
      generationConfig: {
        maxOutputTokens: modelConfig.max_tokens || config.models.defaultMaxTokens,
        temperature: 0.7
      }
    };

    return { deploymentUrl, requestBody };
  }

  parseResponse(result: any): DirectApiResponse {
    let content = '';
    let foundResponse = false;
    
    // Try multiple parsing strategies for different SAP AI Core response formats
    
    // Strategy 1: Standard Gemini format
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const textPart = candidate.content.parts.find((part: any) => part.text);
        if (textPart && textPart.text) {
          content = textPart.text;
          foundResponse = true;
        }
      }
    }
    
    // Strategy 2: Alternative candidate structures
    if (!foundResponse && result.candidates && result.candidates.length > 0) {
      for (const candidate of result.candidates) {
        // Try direct text field
        if (candidate.text) {
          content = candidate.text;
          foundResponse = true;
          break;
        }
        // Try message field
        if (candidate.message) {
          content = candidate.message;
          foundResponse = true;
          break;
        }
        // Try output field
        if (candidate.output) {
          content = candidate.output;
          foundResponse = true;
          break;
        }
      }
    }
    
    // Strategy 3: Direct response fields
    if (!foundResponse) {
      const directFields = ['text', 'response', 'message', 'output', 'content'];
      for (const field of directFields) {
        if (result[field] && typeof result[field] === 'string') {
          content = result[field];
          foundResponse = true;
          break;
        }
      }
    }
    
    // Strategy 4: Check for error responses
    if (!foundResponse) {
      if (result.error) {
        content = `Error: ${result.error.message || result.error}`;
      } else if (result.errors && result.errors.length > 0) {
        content = `Error: ${result.errors[0].message || result.errors[0]}`;
      } else {
        content = 'No response';
      }
    }
    
    return {
      success: true,
      text: content,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    };
  }

  formatContent(content: any): any {
    // For Gemini, we only handle text content since vision is disabled
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      // Filter out images and convert to text-only
      return content
        .filter((item: any) => item.type !== 'image_url')
        .map((item: any) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item.type === 'text') {
            return item.text;
          }
          return JSON.stringify(item);
        })
        .join(' ');
    }
    
    return JSON.stringify(content);
  }
}
