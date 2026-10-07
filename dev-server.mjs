import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const requestedPort = Number.parseInt(process.env.PORT ?? "", 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : DEFAULT_PORT;

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function resolveRequestedFile(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}`);
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname).replaceAll("\\", "/");
  } catch {
    return null;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = resolve(ROOT_DIRECTORY, `.${pathname}`);
  const relativePath = relative(ROOT_DIRECTORY, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "허용되지 않은 요청입니다.");
    return;
  }

  const filePath = resolveRequestedFile(request.url ?? "/");

  if (!filePath) {
    sendText(response, 400, "올바르지 않은 주소입니다.");
    return;
  }

  try {
    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      sendText(response, 404, "페이지를 찾을 수 없습니다.");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      sendText(response, 404, "페이지를 찾을 수 없습니다.");
      return;
    }

    console.error(error);
    sendText(response, 500, "서버에서 파일을 읽지 못했습니다.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`감정일기 개발 서버: http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  console.error("개발 서버를 시작하지 못했습니다.", error);
  process.exitCode = 1;
});
