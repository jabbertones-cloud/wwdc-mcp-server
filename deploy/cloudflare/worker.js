import { DurableObject } from "cloudflare:workers";

const PORT = 8789;
const INACTIVITY_MS = 15 * 60 * 1000;

export class WwdcContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() => ctx.container.setInactivityTimeout(INACTIVITY_MS));
    }
  }

  async fetch(request) {
    const container = this.ctx.container;
    if (!container) return new Response("container unavailable", { status: 503 });

    if (!container.running) {
      container.start({
        image: container.images.base,
        enableInternet: true,
        envVars: {
          WWDC_MCP_PUBLIC_READ_ONLY: "1",
          WWDC_MCP_HTTP_HOST: "0.0.0.0",
          WWDC_MCP_HTTP_PORT: String(PORT),
          WWDC_MCP_DB: "/app/data/wwdc.db",
          WWDC_SKIP_EMBEDDINGS: "1",
          WWDC_MCP_DEPLOYED_SHA: "93eae9425e3d1fc1a9b3dd6964abff067baf44d5"
        }
      });
      await container.setInactivityTimeout(INACTIVITY_MS);
    }

    const port = container.getTcpPort(PORT);
    let lastError;
    for (let i = 0; i < 100; i++) {
      try {
        const health = await port.fetch("http://container/healthz", { signal: AbortSignal.timeout(1000) });
        await health.body?.cancel();
        if (health.ok) break;
      } catch (error) { lastError = error; }
      await scheduler.wait(200);
      if (i === 99) throw lastError ?? new Error("container readiness timeout");
    }

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return port.fetch(forwarded);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp" && url.pathname !== "/healthz") {
      return new Response("Not Found", { status: 404 });
    }
    return env.WWDC_CONTAINER.getByName("public").fetch(request);
  }
};
