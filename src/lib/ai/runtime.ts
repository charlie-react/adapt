import "server-only";
import { createBedrockProvider } from "./bedrock";

export const explanationProvider = createBedrockProvider({
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
  modelId: process.env.BEDROCK_MODEL_ID,
});
