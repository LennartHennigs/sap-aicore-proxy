interface AppConfig {
  server: {
    port: number;
    host: string;
    bodyLimit: {
      json: string;
      urlencoded: string;
      raw: string;
    };
  };
  aicore: {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    baseUrl: string;
    deploymentUrl: string;
  };
  auth: {
    tokenExpiryBuffer: number; // seconds
    defaultTokenExpiry: number; // seconds
  };
  cors: {
    origin: string;
    methods: string[];
    allowedHeaders: string[];
  };
  models: {
    defaultModel: string;
    defaultMaxTokens: number;
    pooling: {
      maxIdleTime: number; // milliseconds
      cleanupInterval: number; // milliseconds
    };
    providers: {
      sapAiCore: {
        prefix: string;
      };
    };
    defaults: {
      anthropic: {
        version: string;
        endpoint: string;
      };
      gemini: {
        endpoint: string;
      };
      generic: {
        endpoint: string;
      };
    };
  };
}

function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
}

export const config: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || 'localhost',
    bodyLimit: {
      json: process.env.BODY_LIMIT_JSON || '50mb',
      urlencoded: process.env.BODY_LIMIT_URLENCODED || '50mb',
      raw: process.env.BODY_LIMIT_RAW || '50mb'
    }
  },
  aicore: {
    clientId: validateEnvVar('AICORE_CLIENT_ID', process.env.AICORE_CLIENT_ID),
    clientSecret: validateEnvVar('AICORE_CLIENT_SECRET', process.env.AICORE_CLIENT_SECRET),
    authUrl: validateEnvVar('AICORE_AUTH_URL', process.env.AICORE_AUTH_URL),
    baseUrl: validateEnvVar('AICORE_BASE_URL', process.env.AICORE_BASE_URL),
    deploymentUrl: validateEnvVar('AICORE_DEPLOYMENT_URL', process.env.AICORE_DEPLOYMENT_URL)
  },
  auth: {
    tokenExpiryBuffer: parseInt(process.env.TOKEN_EXPIRY_BUFFER || '60', 10),
    defaultTokenExpiry: parseInt(process.env.DEFAULT_TOKEN_EXPIRY || '3600', 10)
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  models: {
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-5-nano',
    defaultMaxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '1000', 10),
    pooling: {
      maxIdleTime: parseInt(process.env.MODEL_POOL_MAX_IDLE_TIME || '1800000', 10), // 30 minutes
      cleanupInterval: parseInt(process.env.MODEL_POOL_CLEANUP_INTERVAL || '300000', 10) // 5 minutes
    },
    providers: {
      sapAiCore: {
        prefix: process.env.SAP_AICORE_PROVIDER_PREFIX || 'sap-aicore'
      }
    },
    defaults: {
      anthropic: {
        version: process.env.ANTHROPIC_DEFAULT_VERSION || 'bedrock-2023-05-31',
        endpoint: process.env.ANTHROPIC_DEFAULT_ENDPOINT || '/invoke'
      },
      gemini: {
        endpoint: process.env.GEMINI_DEFAULT_ENDPOINT || '/models/gemini-2.5-flash:generateContent'
      },
      generic: {
        endpoint: process.env.GENERIC_DEFAULT_ENDPOINT || ''
      }
    }
  }
};
