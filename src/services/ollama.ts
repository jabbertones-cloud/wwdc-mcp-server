/**
 * @deprecated Compatibility entry point for the pre-v0.2 Ollama-backed embedding service.
 * Current semantic search uses local Hugging Face Transformers/ONNX and requires no Ollama service.
 */
export * from "./embeddings.js";
import { checkEmbeddings, resetEmbeddingStatus } from "./embeddings.js";

export const checkOllama = checkEmbeddings;
export const resetOllamaStatus = resetEmbeddingStatus;
