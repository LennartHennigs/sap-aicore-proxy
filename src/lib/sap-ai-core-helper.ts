import { addMinutes, isBefore } from 'date-fns';
import { z } from 'zod';
import { fetchJsonObject } from './fetch-json-object.js';

export interface SapAiCoreHelperParams {
  clientId?: string;
  clientSecret?: string;
  accessTokenUrl?: string;
  aiApiBaseUrl?: string;
}

export class SapAiCoreHelper {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly accessTokenUrl: string;
  private readonly aiApiBaseUrl: string;
  private accessToken: string | null = null;
  private expiresAt: string | null = null;

  constructor({ clientId, clientSecret, accessTokenUrl, aiApiBaseUrl }: SapAiCoreHelperParams = {}) {
    this.clientId = clientId ?? process.env.CLIENT_ID ?? '';
    this.clientSecret = clientSecret ?? process.env.CLIENT_SECRET ?? '';
    this.accessTokenUrl = accessTokenUrl ?? process.env.ACCESS_TOKEN_URL ?? '';
    this.aiApiBaseUrl = aiApiBaseUrl ?? process.env.AI_API_BASE_URL ?? '';

    if (!this.clientId) throw new Error('CLIENT_ID is not defined in parameters or environment variables.');
    if (!this.clientSecret) throw new Error('CLIENT_SECRET is not defined in parameters or environment variables.');
    if (!this.accessTokenUrl) throw new Error('ACCESS_TOKEN_URL is not defined in parameters or environment variables.');
    if (!this.aiApiBaseUrl) throw new Error('AI_API_BASE_URL is not defined in parameters or environment variables.');
  }

  accessTokenProvider = async (): Promise<string> => {
    // Check if the access token is already available and not expired
    if (this.accessToken && this.expiresAt && !isBefore(new Date(this.expiresAt), new Date())) {
      return this.accessToken;
    }

    // If the access token is expired or not available, fetch a new one
    const { access_token: accessToken } = await fetchJsonObject(
      z.object({
        access_token: z.string().describe('Access token for the API')
      }),
      `${this.accessTokenUrl}/oauth/token?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`
        }
      }
    );
    const expiresAt = addMinutes(new Date(), 55).toISOString();

    this.accessToken = accessToken;
    this.expiresAt = expiresAt;

    return accessToken;
  };

  getRequestHeaders(): Record<string, string> {
    return {
      'AI-Resource-Group': 'default',
      'Content-Type': 'application/json'
    };
  }

  async getModelDeploymentUrl(modelId: string): Promise<string> {
    const url = `${this.aiApiBaseUrl}/v2/lm/deployments?scenarioId=foundation-models`;
    const accessToken = await this.accessTokenProvider();

    const data = await fetchJsonObject(
      z.object({
        count: z.number(),
        resources: z.array(
          z.object({
            id: z.string().describe('ID of the deployment'),
            deploymentUrl: z.string().describe('Consumption URL of the deployment'),
            configurationId: z.string().describe('ID of the configuration'),
            status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'DEAD', 'STOPPING', 'STOPPED', 'UNKNOWN']),
            details: z.object({
              resources: z.object({
                backendDetails: z.object({ model: z.object({ name: z.string(), version: z.string() }) })
              })
            })
          })
        )
      }),
      url,
      {
        method: 'GET',
        headers: {
          'AI-Resource-Group': 'default',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    // Find the deployment with the specified model ID
    const deployment = data.resources.find((resource) => resource.details.resources.backendDetails.model.name === modelId);
    if (!deployment) {
      throw new Error(`Model "${modelId}" is not currently deployed. Please deploy the model before proceeding.`);
    }
    if (deployment.status !== 'RUNNING') {
      throw new Error(`Model "${modelId}" is not in a running state. Current status: ${deployment.status}`);
    }

    return deployment.deploymentUrl;
  }
}
