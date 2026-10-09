import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { Readable, Writable } from "node:stream";
import { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeEgressProxy } from "../safe-egress-proxy";

const proxies: ReturnType<typeof createSafeEgressProxy>[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
});

function createProxy(resolveAddresses: (hostname: string) => Promise<string[]>): ReturnType<typeof createSafeEgressProxy> {
  const proxy = createSafeEgressProxy({ resolveAddresses });
  proxies.push(proxy);
  return proxy;
}

describe("safe yt-dlp egress proxy", () => {
  it("blocks an HTTP redirect target resolving to a private address", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["127.0.0.1"]);
    const proxy = createProxy(resolveAddresses);
    const proxyUrl = await proxy.listen();
    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const target = new URL("http://media-cdn.example/redirected-resource");
      const request = httpRequest(proxyUrl, {
        method: "GET",
        path: target.toString(),
        headers: { host: target.host },
      }, (result) => {
        let body = "";
        result.setEncoding("utf8");
        result.on("data", (chunk: string) => { body += chunk; });
        result.on("end", () => {
          resolve({ statusCode: result.statusCode ?? 0, body });
        });
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });

    expect(resolveAddresses).toHaveBeenCalledWith("media-cdn.example");
    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("destination is not allowed");
    expect(response.body).not.toContain("127.0.0.1");
  });

  it("forwards HTTP only to the DNS-pinned public IP while preserving the virtual Host", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8", "1.1.1.1"]);
    const upstreamOptions: {
      hostname?: string | null;
      family?: number;
      hostHeaderPresent?: boolean;
      path?: string | null;
      proxyAuthorizationPresent?: boolean;
    } = {};
    const createUpstream = vi.fn((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      upstreamOptions.hostname = options.hostname;
      upstreamOptions.family = options.family;
      upstreamOptions.path = options.path;
      if (options.headers && !Array.isArray(options.headers)) {
        upstreamOptions.hostHeaderPresent = Object.hasOwn(options.headers, "host");
        upstreamOptions.proxyAuthorizationPresent = Object.hasOwn(options.headers, "proxy-authorization");
      }
      const upstream = new Writable({
        write(_chunk, _encoding, done) { done(); },
        final(done) {
          done();
          const response = Object.assign(Readable.from(Buffer.from("safe upstream")), {
            statusCode: 206,
            headers: { "content-type": "text/plain" },
          }) as IncomingMessage;
          callback(response);
        },
      });
      return upstream as ClientRequest;
    });
    const proxy = createSafeEgressProxy({ resolveAddresses, httpRequest: createUpstream });
    proxies.push(proxy);
    const proxyUrl = await proxy.listen();
    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const target = new URL("http://redirect-cdn.example/video?range=1");
      const request = httpRequest(proxyUrl, {
        method: "GET",
        path: target.toString(),
        headers: { host: target.host, "proxy-authorization": "must-not-forward" },
      }, (result) => {
        let body = "";
        result.setEncoding("utf8");
        result.on("data", (chunk: string) => { body += chunk; });
        result.on("end", () => { resolve({ statusCode: result.statusCode ?? 0, body }); });
      });
      request.on("error", reject);
      request.end();
    });

    expect(response).toEqual({ statusCode: 206, body: "safe upstream" });
    expect(resolveAddresses).toHaveBeenCalledWith("redirect-cdn.example");
    expect(upstreamOptions).toEqual({
      hostname: "8.8.8.8",
      family: 4,
      hostHeaderPresent: true,
      path: "/video?range=1",
      proxyAuthorizationPresent: false,
    });
  });

  it("blocks HTTPS CONNECT when any DNS answer is private", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8", "169.254.169.254"]);
    const proxy = createProxy(resolveAddresses);
    const proxyUrl = new URL(await proxy.listen());
    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const request = httpRequest({
        hostname: proxyUrl.hostname,
        port: Number(proxyUrl.port),
        method: "CONNECT",
        path: "redirect-cdn.example:443",
      });
      request.on("connect", (result, socket) => {
        const statusCode = result.statusCode ?? 0;
        socket.on("data", (chunk) => {
          resolve({ statusCode, body: chunk.toString("utf8") });
        });
        socket.on("end", () => {
          resolve({ statusCode, body: "" });
        });
        socket.on("error", reject);
        socket.end();
      });
      request.on("response", (result) => {
        let body = "";
        result.setEncoding("utf8");
        result.on("data", (chunk: string) => { body += chunk; });
        result.on("end", () => {
          resolve({ statusCode: result.statusCode ?? 0, body });
        });
      });
      request.on("error", reject);
      request.end();
    });

    expect(resolveAddresses).toHaveBeenCalledWith("redirect-cdn.example");
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("169.254.169.254");
  });

  it("opens a TLS tunnel only to the pinned public address", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8", "1.1.1.1"]);
    const upstream = new Socket();
    const connectTcp = vi.fn(() => {
      setTimeout(() => upstream.emit("connect"), 0);
      return upstream;
    });
    const proxy = createSafeEgressProxy({ resolveAddresses, connectTcp });
    proxies.push(proxy);
    const proxyUrl = new URL(await proxy.listen());
    const tunnel = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        hostname: proxyUrl.hostname,
        port: Number(proxyUrl.port),
        method: "CONNECT",
        path: "redirect-cdn.example:443",
      });
      request.on("connect", (response, clientSocket) => {
        const statusCode = response.statusCode ?? 0;
        clientSocket.destroy();
        resolve(statusCode);
      });
      request.on("response", (response) => {
        response.resume();
        response.on("end", () => {
          resolve(response.statusCode ?? 0);
        });
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });

    expect(tunnel).toBe(200);
    expect(resolveAddresses).toHaveBeenCalledWith("redirect-cdn.example");
    expect(connectTcp).toHaveBeenCalledWith({ host: "8.8.8.8", family: 4, port: 443 });
    upstream.destroy();
  });

  it("rejects unsupported ports and host authentication before DNS lookup", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8"]);
    const proxy = createProxy(resolveAddresses);
    const proxyUrl = await proxy.listen();
    const response = await new Promise<number>((resolve, reject) => {
      const target = new URL("http://media-cdn.example:8080/private");
      const request = httpRequest(proxyUrl, {
        method: "GET",
        path: target.toString(),
        headers: { host: target.host },
      }, (result) => {
        result.resume();
        result.on("end", () => {
          resolve(result.statusCode ?? 0);
        });
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });

    expect(response).toBe(403);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it.each([
    ["https://media-cdn.example/path", 403],
    ["http://user:password@media-cdn.example/path", 403],
    ["not-an-absolute-url", 400],
    ["http://127.0.0.1/private", 403],
  ] as const)("blocks malformed or private HTTP proxy target %s before DNS lookup", async (targetUrl, expectedStatus) => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8"]);
    const proxy = createProxy(resolveAddresses);
    const proxyUrl = await proxy.listen();
    const statusCode = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(proxyUrl, {
        method: "GET",
        path: targetUrl,
        headers: { host: "media-cdn.example" },
      }, (result) => {
        result.resume();
        result.on("end", () => {
          resolve(result.statusCode ?? 0);
        });
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });

    expect(statusCode).toBe(expectedStatus);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it("blocks empty or failed DNS answers without exposing resolver errors", async () => {
    const resolveAddresses = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("private DNS resolver details"));
    const proxy = createProxy(resolveAddresses);
    const proxyUrl = await proxy.listen();

    for (const hostname of ["empty.example", "failure.example"]) {
      const statusCode = await new Promise<number>((resolve, reject) => {
        const target = new URL(`http://${hostname}/resource`);
        const request = httpRequest(proxyUrl, {
          method: "GET",
          path: target.toString(),
          headers: { host: target.host },
        }, (result) => {
          result.resume();
          result.on("end", () => {
            resolve(result.statusCode ?? 0);
          });
        });
        request.on("error", (error) => {
          reject(error);
        });
        request.end();
      });
      expect(statusCode).toBe(403);
    }
  });

  it("blocks malformed CONNECT authorities and permits idempotent pre-start cleanup", async () => {
    const resolveAddresses = vi.fn().mockResolvedValue(["8.8.8.8"]);
    const proxy = createProxy(resolveAddresses);
    await expect(proxy.close()).resolves.toBeUndefined();
    const proxyUrl = new URL(await proxy.listen());
    const statusCode = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        hostname: proxyUrl.hostname,
        port: Number(proxyUrl.port),
        method: "CONNECT",
        path: "media-cdn.example:444",
      });
      request.on("response", (result) => {
        result.resume();
        result.on("end", () => {
          resolve(result.statusCode ?? 0);
        });
      });
      request.on("connect", (result, socket) => {
        socket.destroy();
        resolve(result.statusCode ?? 0);
      });
      request.on("error", (error) => {
        reject(error);
      });
      request.end();
    });

    expect(statusCode).toBe(403);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });
});