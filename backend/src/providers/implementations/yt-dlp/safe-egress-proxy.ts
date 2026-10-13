import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type IncomingHttpHeaders,
  type RequestOptions,
  type ServerResponse,
} from "node:http";
import { connect as connectTcp, isIP } from "node:net";
import type { Duplex } from "node:stream";
import { resolvePublicDnsAddresses, isPublicAddress } from "../../../services/downloads/validate-media-url-service";

interface SafeEgressProxyDependencies {
  upstreamProxyUrl?: string;
  upstreamTimeoutMs?: number;
  resolveAddresses?: (hostname: string) => Promise<string[]>;
  httpRequest?: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
  connectTcp?: typeof connectTcp;
}

interface Destination {
  hostname: string;
  port: number;
}

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

function parseHttpDestination(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const target = new URL(value);
    if (
      target.protocol !== "http:" ||
      target.username.length > 0 ||
      target.password.length > 0 ||
      target.port.length > 0
    ) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

function parseConnectDestination(value: string | undefined): Destination | null {
  if (!value) return null;
  try {
    const target = new URL(`https://${value}`);
    if (
      target.username.length > 0 ||
      target.password.length > 0 ||
      target.pathname !== "/" ||
      target.search.length > 0 ||
      target.hash.length > 0 ||
      (target.port.length > 0 && target.port !== "443")
    ) {
      return null;
    }
    return { hostname: hostnameWithoutBrackets(target.hostname), port: 443 };
  } catch {
    return null;
  }
}

function respondBlocked(response: ServerResponse): void {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8", "connection": "close" });
  response.end("Outbound destination is not allowed");
}

function respondUnavailable(response: ServerResponse): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(502, { "content-type": "text/plain; charset=utf-8", "connection": "close" });
  response.end("Outbound media proxy is unavailable");
}

function respondSocket(socket: Duplex, status: number): void {
  const message = status === 403 ? "Forbidden" : "Bad Gateway";
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function createSafeEgressProxy({
  upstreamProxyUrl,
  upstreamTimeoutMs = 30_000,
  resolveAddresses = resolvePublicDnsAddresses,
  httpRequest: requestHttp = httpRequest,
  connectTcp: connectToAddress = connectTcp,
}: SafeEgressProxyDependencies = {}) {
  const proxy = upstreamProxyUrl ? new URL(upstreamProxyUrl) : undefined;
  const proxyAuthorization = proxy && (proxy.username || proxy.password)
    ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`
    : undefined;
  const upstreamRequests = new Set<ClientRequest>();
  const upstreamSockets = new Set<Duplex>();

  function trackRequest(request: ClientRequest): void {
    upstreamRequests.add(request);
    request.once("close", () => upstreamRequests.delete(request));
  }

  function connectTunnel(clientSocket: Duplex, upstream: Duplex, head: Buffer, upstreamHead = Buffer.alloc(0)): void {
    upstreamSockets.add(upstream);
    upstream.once("close", () => {
      upstreamSockets.delete(upstream);
      clientSocket.destroy();
    });
    clientSocket.once("close", () => upstream.destroy());
    clientSocket.once("error", () => upstream.destroy());
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: embaixador-egress\r\n\r\n");
    if (upstreamHead.length > 0) clientSocket.write(upstreamHead);
    if (head.length > 0) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  }

  async function resolveDestination(hostname: string): Promise<string | null> {
    const normalizedHostname = hostnameWithoutBrackets(hostname);
    if (isIP(normalizedHostname) !== 0) {
      return isPublicAddress(normalizedHostname) ? normalizedHostname : null;
    }

    try {
      const addresses = await resolveAddresses(normalizedHostname);
      if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
        return null;
      }
      return addresses[0] ?? null;
    } catch {
      return null;
    }
  }

  async function forwardHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const target = parseHttpDestination(request.url);
    if (!target) {
      respondBlocked(response);
      return;
    }

    const address = await resolveDestination(target.hostname);
    if (response.destroyed) return;
    if (!address) {
      respondBlocked(response);
      return;
    }

    const headers: IncomingHttpHeaders = { ...request.headers, host: target.host };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    if (proxyAuthorization) headers["proxy-authorization"] = proxyAuthorization;
    const pinnedHost = isIP(address) === 6 ? `[${address}]` : address;
    const upstream = requestHttp({
      hostname: proxy ? hostnameWithoutBrackets(proxy.hostname) : address,
      ...(proxy ? {} : { family: isIP(address) }),
      port: proxy ? Number(proxy.port || 80) : 80,
      method: request.method,
      path: `${proxy ? `http://${pinnedHost}` : ""}${target.pathname}${target.search}`,
      headers,
    }, (upstreamResponse) => {
      clearTimeout(responseTimer);
      if (proxy && (upstreamResponse.statusCode ?? 502) >= 400) {
        upstreamResponse.resume();
        respondUnavailable(response);
        upstream.destroy();
        return;
      }
      upstreamResponse.on("error", () => response.destroy());
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    trackRequest(upstream);
    const responseTimer = proxy ? setTimeout(() => {
      respondUnavailable(response);
      upstream.destroy();
    }, upstreamTimeoutMs) : undefined;
    upstream.once("close", () => { clearTimeout(responseTimer); });
    if (proxy) {
      upstream.setTimeout(upstreamTimeoutMs, () => {
        respondUnavailable(response);
        upstream.destroy();
      });
    }
    request.once("aborted", () => upstream.destroy());
    response.once("close", () => upstream.destroy());
    upstream.on("error", () => {
      if (proxy) {
        respondUnavailable(response);
        return;
      }
      if (!response.headersSent) respondBlocked(response);
      else response.destroy();
    });
    request.pipe(upstream);
  }

  async function tunnelHttpsRequest(request: IncomingMessage, clientSocket: Duplex, head: Buffer): Promise<void> {
    const destination = parseConnectDestination(request.url);
    if (!destination) {
      respondSocket(clientSocket, 403);
      return;
    }

    const address = await resolveDestination(destination.hostname);
    if (clientSocket.destroyed) return;
    if (!address) {
      respondSocket(clientSocket, 403);
      return;
    }

    if (proxy) {
      const pinnedHost = isIP(address) === 6 ? `[${address}]` : address;
      const authority = `${pinnedHost}:${destination.port}`;
      const upstream = requestHttp({
        hostname: hostnameWithoutBrackets(proxy.hostname),
        port: Number(proxy.port || 80),
        method: "CONNECT",
        path: authority,
        headers: {
          host: authority,
          ...(proxyAuthorization ? { "proxy-authorization": proxyAuthorization } : {}),
        },
        agent: false,
      }, (response) => {
        response.resume();
        fail();
      });
      trackRequest(upstream);
      let settled = false;
      const timer = setTimeout(fail, upstreamTimeoutMs);
      function fail(): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        respondSocket(clientSocket, 502);
        upstream.destroy();
      }
      clientSocket.once("close", () => {
        clearTimeout(timer);
        settled = true;
        upstream.destroy();
      });
      clientSocket.once("error", fail);
      upstream.on("error", fail);
      upstream.once("connect", (response, socket, upstreamHead) => {
        if (settled || response.statusCode !== 200 || clientSocket.destroyed) {
          socket.destroy();
          fail();
          return;
        }
        settled = true;
        clearTimeout(timer);
        connectTunnel(clientSocket, socket, head, upstreamHead);
      });
      upstream.end();
      return;
    }

    const upstream = connectToAddress({ host: address, family: isIP(address), port: destination.port });
    upstream.once("connect", () => {
      connectTunnel(clientSocket, upstream, head);
    });
    upstream.once("error", () => {
      respondSocket(clientSocket, 502);
    });
    clientSocket.once("error", () => upstream.destroy());
  }

  const server = createServer((request, response) => {
    void forwardHttpRequest(request, response).catch(() => {
      respondUnavailable(response);
    });
  });
  const clientSockets = new Set<Duplex>();
  server.on("connection", (socket) => {
    clientSockets.add(socket);
    socket.once("close", () => {
      clientSockets.delete(socket);
    });
  });
  server.on("connect", (request, socket, head) => {
    void tunnelHttpsRequest(request, socket, head).catch(() => {
      respondSocket(socket, 502);
    });
  });

  function listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        reject(error);
      };
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", onError);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Egress proxy did not bind to a TCP port"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  function close(): Promise<void> {
    if (!server.listening) return Promise.resolve();
    for (const socket of clientSockets) socket.destroy();
    for (const request of upstreamRequests) request.destroy();
    for (const socket of upstreamSockets) socket.destroy();
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  return { listen, close };
}

export { createSafeEgressProxy };