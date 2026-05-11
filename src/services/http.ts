/**
 * Shared HTTP client — axios with retry, timeout, polite User-Agent.
 */
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { REQUEST_TIMEOUT_MS, REQUEST_RETRY, USER_AGENT } from "../constants.js";

const client = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9,*/*;q=0.5" },
  // Follow redirects automatically (default)
  maxRedirects: 5,
  validateStatus: () => true, // handle ourselves
});

export async function httpGet<T = unknown>(
  url: string,
  opts: AxiosRequestConfig = {},
): Promise<{ data: T; status: number; headers: Record<string, string> }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= REQUEST_RETRY; attempt++) {
    try {
      const resp = await client.get<T>(url, opts);
      if (resp.status >= 200 && resp.status < 300) {
        return {
          data: resp.data,
          status: resp.status,
          headers: resp.headers as Record<string, string>,
        };
      }
      if (resp.status >= 500 || resp.status === 429) {
        lastErr = new HttpError(resp.status, `${url} → HTTP ${resp.status}`);
        await delay(200 * (attempt + 1) ** 2);
        continue;
      }
      throw new HttpError(resp.status, `${url} → HTTP ${resp.status}`);
    } catch (e) {
      const isAxios = e instanceof AxiosError;
      const retriable = isAxios && (!e.response || e.code === "ECONNABORTED" || e.code === "ETIMEDOUT");
      if (retriable && attempt < REQUEST_RETRY) {
        await delay(300 * (attempt + 1) ** 2);
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("httpGet: unknown error");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
