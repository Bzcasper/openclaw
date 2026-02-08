import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MemoryConfig = {
  embedding: {
    provider: "openai";
    model?: string;
    apiKey: string;
    baseUrl?: string;
    /**
     * Optional override when using non-OpenAI embedding models.
     * If unset, we infer dimensions from known model IDs.
     */
    dimensions?: number;
  };
  rerank?: {
    enabled?: boolean;
    /** OpenAI-style base URL ending in `/v1` (e.g. https://.../v1). */
    baseUrl?: string;
    topN?: number;
  };
  dbPath?: string;
  autoCapture?: boolean;
  autoRecall?: boolean;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const DEFAULT_MODEL = "text-embedding-3-small";
const LEGACY_STATE_DIRS: string[] = [];

function resolveDefaultDbPath(): string {
  const home = homedir();
  const preferred = join(home, ".openclaw", "memory", "lancedb");
  try {
    if (fs.existsSync(preferred)) {
      return preferred;
    }
  } catch {
    // best-effort
  }

  for (const legacy of LEGACY_STATE_DIRS) {
    const candidate = join(home, legacy, "memory", "lancedb");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // best-effort
    }
  }

  return preferred;
}

const DEFAULT_DB_PATH = resolveDefaultDbPath();

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  // SentenceTransformers (common IDs)
  "BAAI/bge-small-en-v1.5": 384,
  "bge-small-en-v1.5": 384,
};

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) {
    return;
  }
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) {
    throw new Error(
      `Unsupported embedding model: ${model}. Set embedding.dimensions to override vector size.`,
    );
  }
  return dims;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function resolveEmbeddingModel(embedding: Record<string, unknown>): string {
  return typeof embedding.model === "string" ? embedding.model : DEFAULT_MODEL;
}

function resolveEmbeddingDims(params: { model: string; dimensions?: unknown }): number {
  if (params.dimensions === undefined) {
    return vectorDimsForModel(params.model);
  }
  if (typeof params.dimensions !== "number" || !Number.isFinite(params.dimensions)) {
    throw new Error("embedding.dimensions must be a finite number");
  }
  if (!Number.isInteger(params.dimensions) || params.dimensions <= 0) {
    throw new Error("embedding.dimensions must be a positive integer");
  }
  return params.dimensions;
}

function resolveOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory config required");
    }
    const cfg = value as Record<string, unknown>;
    assertAllowedKeys(
      cfg,
      ["embedding", "rerank", "dbPath", "autoCapture", "autoRecall"],
      "memory config",
    );

    const embedding = cfg.embedding as Record<string, unknown> | undefined;
    if (!embedding || typeof embedding.apiKey !== "string") {
      throw new Error("embedding.apiKey is required");
    }
    assertAllowedKeys(embedding, ["apiKey", "model", "baseUrl", "dimensions"], "embedding config");

    const model = resolveEmbeddingModel(embedding);
    const dimensions = resolveEmbeddingDims({ model, dimensions: embedding.dimensions });
    const baseUrl = resolveOptionalString(embedding.baseUrl);

    let rerank: MemoryConfig["rerank"] | undefined;
    if (cfg.rerank !== undefined) {
      if (!cfg.rerank || typeof cfg.rerank !== "object" || Array.isArray(cfg.rerank)) {
        throw new Error("rerank must be an object");
      }
      const raw = cfg.rerank as Record<string, unknown>;
      assertAllowedKeys(raw, ["enabled", "baseUrl", "topN"], "rerank config");
      const enabled = raw.enabled === true;
      const topNRaw = raw.topN;
      let topN: number | undefined;
      if (topNRaw !== undefined) {
        if (typeof topNRaw !== "number" || !Number.isFinite(topNRaw)) {
          throw new Error("rerank.topN must be a finite number");
        }
        if (!Number.isInteger(topNRaw) || topNRaw <= 0) {
          throw new Error("rerank.topN must be a positive integer");
        }
        topN = topNRaw;
      }

      rerank = {
        enabled,
        baseUrl: resolveOptionalString(raw.baseUrl),
        topN,
      };
    }

    return {
      embedding: {
        provider: "openai",
        model,
        apiKey: resolveEnvVars(embedding.apiKey),
        baseUrl: baseUrl ? resolveEnvVars(baseUrl) : undefined,
        dimensions,
      },
      rerank,
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
    };
  },
  uiHints: {
    "embedding.apiKey": {
      label: "Embeddings API Key",
      sensitive: true,
      placeholder: "sk-proj-...",
      help: "API key for embeddings (OpenAI-compatible). Use ${OPENAI_API_KEY} or a dummy value if your endpoint does not require auth.",
    },
    "embedding.baseUrl": {
      label: "Embeddings Base URL",
      placeholder: "https://api.openai.com/v1",
      help: "Override the OpenAI API base URL (OpenAI-compatible). Must include /v1 (example: https://...modal.run/v1).",
      advanced: true,
    },
    "embedding.model": {
      label: "Embedding Model",
      placeholder: DEFAULT_MODEL,
      help: "Embedding model identifier passed through to the embeddings endpoint.",
      advanced: true,
    },
    "embedding.dimensions": {
      label: "Vector Dimensions",
      placeholder: "1536",
      help: "Required for non-OpenAI embeddings unless the model is known (example: BAAI/bge-small-en-v1.5 = 384).",
      advanced: true,
    },
    "rerank.enabled": {
      label: "Rerank Recall",
      help: "Rerank memory recall results using an external reranking endpoint.",
      advanced: true,
    },
    "rerank.baseUrl": {
      label: "Rerank Base URL",
      placeholder: "https://.../v1",
      help: "Defaults to embedding.baseUrl when omitted. Must include /v1.",
      advanced: true,
    },
    "rerank.topN": {
      label: "Rerank Top N",
      placeholder: "5",
      help: "How many candidates to return from reranking (defaults to the recall limit).",
      advanced: true,
    },
    dbPath: {
      label: "Database Path",
      placeholder: "~/.openclaw/memory/lancedb",
      advanced: true,
    },
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically capture important information from conversations",
    },
    autoRecall: {
      label: "Auto-Recall",
      help: "Automatically inject relevant memories into context",
    },
  },
};
