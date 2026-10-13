import { createServer, request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { Readable, Writable } from "node:stream";
import { connect, Socket } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeEgressProxy } from "../safe-egress-proxy";

const proxies: ReturnType<typeof createSafeEgressProxy>[] = [];
const upstreamFixtures: { server: ReturnType<typeof createServer>; sockets: Set<Duplex> }[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(upstreamFixtures.splice(0).map(({ server, sockets }) => {
    for (const socket of sockets) socket.destroy();
    return new Promise<void>((resolve, reject) => server.close((error) => {
      if (error) reject(error);
      else resolve();
    }));
  }));
});

async function startUpstream(server: ReturnType<typeof createServer>): Promise<string> {
  const sockets = new Set<Duplex>();
  upstreamFixtures.push({ server, sockets });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not bind");
  return `http://user:p%40ss%3A%23%25@127.0.0.1:${address.port}`;
}

function getThroughProxy(proxyUrl: string, target = "http://cdn.example/media"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(proxyUrl, {
      path: target,
      headers: { "proxy-authorization": "client-secret" },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => { resolve({ status: response.statusCode ?? 0, body }); });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

function tunnelThroughProxy(proxyUrl: string): Promise<string> {
  const url = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) });
    let output = "";
    let streamSent = false;
    socket.setTimeout(2000, () => socket.destroy(new Error("Tunnel fixture timed out")));
    socket.once("connect", () => {
      socket.write("CONNECT cdn.example:443 HTTP/1.1\r\nHost: cdn.example:443\r\n\r\nclient-head");
    });
    socket.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (!streamSent && output.includes("server-head")) {
        streamSent = true;
        socket.write("stream-data");
      }
      if (output.includes("server-headclient-headstream-data")) {
        resolve(output);
        socket.destroy();
      }
    });
    socket.on("end", () => { resolve(output); });
    socket.on("error", reject);
  });
}

function createProxy(resolveAddresses: (hostname: string) => Promise<string[]>): ReturnType<typeof createSafeEgressProxy> {
  const proxy = createSafeEgressProxy({ resolveAddresses });
  proxies.push(proxy);
  return proxy;
}

describe("safe yt-dlp egress proxy", () => {
  it.each(["8.8.8.8", "2001:4860:4860::8888"])("forwards HTTP through an authenticated upstream to pinned IP %s", async (ip) => {
    const received = vi.fn();
    const server = createServer((request, response) => {
      received(request.url, request.headers.host, request.headers["proxy-authorization"]);
      response.end("media");
    });
    const upstreamProxyUrl = await startUpstream(server);
    const connectTcp = vi.fn();
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl,
      resolveAddresses: vi.fn().mockResolvedValue([ip]),
      connectTcp,
    });
    proxies.push(proxy);
    expect(await getThroughProxy(await proxy.listen(), "http://cdn.example/media?range=1"))
      .toEqual({ status: 200, body: "media" });
    const authority = ip.includes(":") ? `[${ip}]` : ip;
    expect(received).toHaveBeenCalledWith(
      `http://${authority}/media?range=1`, "cdn.example", `Basic ${Buffer.from("user:p@ss:#%").toString("base64")}`,
    );
    expect(connectTcp).not.toHaveBeenCalled();
  });

  it.each(["8.8.8.8", "2001:4860:4860::8888"])("tunnels HTTPS through authenticated CONNECT to pinned IP %s", async (ip) => {
    const received = vi.fn();
    const server = createServer();
    server.on("connect", (request, socket, head) => {
      received(request.url, request.headers["proxy-authorization"]);
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\nserver-head");
      if (head.length) socket.write(head);
      socket.pipe(socket);
    });
    const upstreamProxyUrl = await startUpstream(server);
    const connectTcp = vi.fn();
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl,
      resolveAddresses: vi.fn().mockResolvedValue([ip]),
      connectTcp,
    });
    proxies.push(proxy);
    const output = await tunnelThroughProxy(await proxy.listen());
    expect(output).toContain("200 Connection Established");
    expect(output).toContain("server-headclient-head");
    expect(output).toContain("stream-data");
    expect(output).not.toContain("user");
    const authority = ip.includes(":") ? `[${ip}]` : ip;
    expect(received).toHaveBeenCalledWith(`${authority}:443`, `Basic ${Buffer.from("user:p@ss:#%").toString("base64")}`);
    expect(connectTcp).not.toHaveBeenCalled();
  });

  it("blocks private destinations before reaching the configured upstream", async () => {
    const received = vi.fn();
    const server = createServer(received);
    server.on("connect", received);
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: await startUpstream(server),
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8", "127.0.0.1"]),
    });
    proxies.push(proxy);
    const url = await proxy.listen();
    expect((await getThroughProxy(url)).status).toBe(403);
    expect(await tunnelThroughProxy(url)).toContain("403 Forbidden");
    expect(received).not.toHaveBeenCalled();
  });

  it("supports an upstream without credentials and never forwards client proxy authentication", async () => {
    const received = vi.fn();
    const server = createServer((request, response) => {
      received(request.headers["proxy-authorization"]);
      response.end("media");
    });
    const url = new URL(await startUpstream(server));
    url.username = "";
    url.password = "";
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: url.toString(),
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8"]),
    });
    proxies.push(proxy);
    expect((await getThroughProxy(await proxy.listen())).status).toBe(200);
    expect(received).toHaveBeenCalledWith(undefined);
  });

  it("closes pending upstream CONNECT requests when the local proxy shuts down", async () => {
    const server = createServer();
    let connected: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { connected = resolve; });
    const closed = new Promise<void>((resolve) => {
      server.on("connect", (_request, socket) => {
        socket.once("close", () => { resolve(); });
        socket.on("end", () => socket.end());
        socket.resume();
        connected?.();
      });
    });
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: await startUpstream(server),
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8"]),
    });
    proxies.push(proxy);
    const result = tunnelThroughProxy(await proxy.listen());
    await ready;
    await proxy.close();
    await closed;
    expect(await result).not.toContain("200 Connection Established");
    await expect(proxy.close()).resolves.toBeUndefined();
  });

  it("closes established upstream tunnels when the local proxy shuts down", async () => {
    const server = createServer();
    let established: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { established = resolve; });
    const closed = new Promise<void>((resolve) => {
      server.on("connect", (_request, socket) => {
        socket.once("close", () => { resolve(); });
        socket.on("end", () => socket.end());
        socket.resume();
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      });
    });
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: await startUpstream(server),
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8"]),
    });
    proxies.push(proxy);
    const url = new URL(await proxy.listen());
    const request = httpRequest({
      hostname: url.hostname, port: Number(url.port), method: "CONNECT", path: "cdn.example:443",
    });
    request.on("connect", (_response, socket) => {
      socket.resume();
      established?.();
    });
    request.end();
    await ready;
    await proxy.close();
    await closed;
  });

  it("closes pending upstream HTTP requests when the local proxy shuts down", async () => {
    let received: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { received = resolve; });
    let disconnected: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => { disconnected = resolve; });
    const server = createServer((request) => {
      request.socket.once("close", () => { disconnected?.(); });
      received?.();
    });
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: await startUpstream(server),
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8"]),
    });
    proxies.push(proxy);
    const result = getThroughProxy(await proxy.listen()).catch((error: unknown) => error);
    await ready;
    await proxy.close();
    await closed;
    expect(await result).toBeInstanceOf(Error);
  });

  it.each(["authentication", "disconnect", "timeout"])("fails closed when upstream has %s failure", async (failure) => {
    const server = createServer((request, response) => {
      if (failure === "authentication") {
        response.writeHead(407);
        response.end("upstream-private-secret");
      } else if (failure === "disconnect") {
        request.socket.destroy();
      }
    });
    server.on("connect", (_request, socket) => {
      if (failure === "authentication") {
        socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 23\r\n\r\nupstream-private-secret");
      } else if (failure === "disconnect") {
        socket.destroy();
      }
    });
    const connectTcp = vi.fn();
    const proxy = createSafeEgressProxy({
      upstreamProxyUrl: await startUpstream(server),
      upstreamTimeoutMs: 50,
      resolveAddresses: vi.fn().mockResolvedValue(["8.8.8.8"]),
      connectTcp,
    });
    proxies.push(proxy);
    const url = await proxy.listen();
    expect(await getThroughProxy(url)).toEqual({
      status: failure === "authentication" ? 407 : 502,
      body: failure === "authentication" ? "Outbound media proxy authentication failed" : "Outbound media proxy is unavailable",
    });
    const output = await tunnelThroughProxy(url);
    expect(output).toContain(failure === "authentication" ? "407 Proxy Authentication Required" : "502 Bad Gateway");
    expect(output).not.toContain("upstream-private-secret");
    expect(connectTcp).not.toHaveBeenCalled();
  });

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