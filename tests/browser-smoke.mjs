import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const [executablePath, browserName = "브라우저", baseUrl = "http://127.0.0.1:4173"] =
  process.argv.slice(2);
const headed = process.argv.includes("--headed");

if (!executablePath) {
  console.error("사용법: node tests/browser-smoke.mjs <브라우저 실행 파일> <브라우저 이름> [주소]");
  process.exit(2);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, message, timeout = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const result = await check();
    if (result) {
      return result;
    }
    await delay(100);
  }
  throw new Error(message);
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];

    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });

    this.socket.addEventListener("message", async (event) => {
      let rawMessage;
      if (typeof event.data === "string") {
        rawMessage = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        rawMessage = new TextDecoder().decode(event.data);
      } else if (typeof event.data?.text === "function") {
        rawMessage = await event.data.text();
      } else {
        rawMessage = new TextDecoder().decode(event.data);
      }

      const message = JSON.parse(rawMessage);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails.text);
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        this.errors.push(message.params.entry.text);
      }
    });

    this.socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("브라우저 디버깅 연결이 닫혔습니다."));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`브라우저 명령 시간이 초과되었습니다: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify(payload));
    return response;
  }

  close() {
    this.socket.close();
  }
}

async function startBrowser() {
  const profileDirectory = await mkdtemp(join(tmpdir(), "mood-diary-browser-test-"));
  const downloadDirectory = join(profileDirectory, "downloads");
  const debuggingPort = await getAvailablePort();
  await mkdir(downloadDirectory);

  const launchArguments = [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      "--disable-extensions",
      `--user-data-dir=${profileDirectory}`,
      `--remote-debugging-port=${debuggingPort}`,
  ];

  if (headed) {
    launchArguments.push("--window-position=-32000,-32000", "--window-size=1280,900");
  } else {
    launchArguments.push(
      "--headless=new",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-shader-disk-cache",
      "--disable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE,GraphiteDawn",
    );
  }
  launchArguments.push("about:blank");

  const browserProcess = spawn(
    executablePath,
    launchArguments,
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );

  let diagnostic = "";
  browserProcess.stderr.setEncoding("utf8");
  browserProcess.stderr.on("data", (chunk) => {
    diagnostic = `${diagnostic}${chunk}`.slice(-2000);
  });

  const webSocketUrl = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
      if (!response.ok) return null;
      return (await response.json()).webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  }, `${browserName} 디버깅 주소를 확인하지 못했습니다. ${diagnostic}`, 15000);

  return {
    browserProcess,
    profileDirectory,
    downloadDirectory,
    webSocketUrl,
    getDiagnostic: () => diagnostic,
  };
}

async function stopBrowser(context, connection) {
  connection.send("Browser.close").catch(() => {});
  await delay(500);
  if (context.browserProcess.exitCode === null) {
    context.browserProcess.kill();
  }
  connection.close();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(context.profileDirectory, { recursive: true, force: true });
      break;
    } catch {
      await delay(200);
    }
  }
}

const context = await startBrowser();
const browserConnection = new CdpConnection(context.webSocketUrl);
let connection = browserConnection;
const sessionId = undefined;

async function evaluate(expression, { userGesture = false } = {}) {
  const response = await connection.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture },
    sessionId,
  );

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text);
  }
  return response.result.value;
}

async function navigate(path) {
  const expectedUrl = new URL(path, baseUrl).href;
  await connection.send("Page.navigate", { url: expectedUrl }, sessionId);
  await waitFor(
    async () =>
      evaluate(`document.readyState === "complete" && location.href === ${JSON.stringify(expectedUrl)}`),
    `${expectedUrl} 페이지가 준비되지 않았습니다.`,
  );
}

async function setFileInput(selector, filePath) {
  const { root } = await connection.send("DOM.getDocument", {}, sessionId);
  const { nodeId } = await connection.send("DOM.querySelector", { nodeId: root.nodeId, selector }, sessionId);
  assert.ok(nodeId, `${selector} 파일 입력 요소를 찾지 못했습니다.`);
  await connection.send("DOM.setFileInputFiles", { files: [filePath], nodeId }, sessionId);
}

try {
  const { targetId } = await browserConnection.send("Target.createTarget", {
    url: new URL("/index.html", baseUrl).href,
  });
  const debuggerHttpUrl = context.webSocketUrl
    .replace(/^ws:/, "http:")
    .replace(/\/devtools\/browser\/.*$/, "");
  const pageTarget = await waitFor(async () => {
    const targets = await fetch(`${debuggerHttpUrl}/json/list`).then((response) => response.json());
    return targets.find((target) => target.id === targetId && target.webSocketDebuggerUrl);
  }, "페이지 디버깅 주소를 확인하지 못했습니다.");
  connection = new CdpConnection(pageTarget.webSocketDebuggerUrl);
  await connection.send("Page.enable", {}, sessionId);
  await connection.send("Runtime.enable", {}, sessionId);
  await connection.send("Log.enable", {}, sessionId);
  await connection.send("DOM.enable", {}, sessionId);
  await waitFor(() => evaluate('document.readyState === "complete"'), "홈 화면이 준비되지 않았습니다.");

  const initial = await evaluate(`(() => ({
    title: document.title,
    days: document.querySelectorAll(".calendar-day").length,
    futureDisabled: document.querySelectorAll(".calendar-day:disabled").length,
    emotions: document.querySelectorAll(".emotion-button").length,
    selectedDate: document.querySelector(".calendar-day.is-selected")?.dataset.date
  }))()`);
  assert.equal(initial.title, "홈 | 감정일기");
  assert.equal(initial.days, 42);
  assert.ok(initial.futureDisabled > 0);
  assert.equal(initial.emotions, 6);
  assert.ok(initial.selectedDate);

  const validation = await evaluate(`(() => {
    document.querySelector("#save-entry").click();
    return {
      emotion: document.querySelector("#emotion-error").textContent,
      content: document.querySelector("#content-error").textContent
    };
  })()`, { userGesture: true });
  assert.match(validation.emotion, /감정/);
  assert.match(validation.content, /작성/);

  const saved = await evaluate(`(() => {
    const emotion = document.querySelector('[data-emotion="happy"]');
    const textarea = document.querySelector("#entry-content");
    emotion.click();
    textarea.value = "Chrome 계열 브라우저 자동 검사 기록";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#save-entry").click();
    return {
      status: document.querySelector("#entry-status").textContent,
      saveLabel: document.querySelector("#save-entry").textContent,
      hasMarker: document.querySelector('.calendar-day.is-selected')?.getAttribute("aria-label")
    };
  })()`, { userGesture: true });
  assert.equal(saved.status, "저장된 기록");
  assert.equal(saved.saveLabel, "수정하기");
  assert.match(saved.hasMarker, /행복 기록 있음/);

  await browserConnection.send(
    "Browser.setDownloadBehavior",
    { behavior: "allow", downloadPath: context.downloadDirectory, eventsEnabled: true },
  );
  await evaluate(`(() => {
    const link = document.querySelector("#backup-button");
    link.click();
    return link.download;
  })()`, { userGesture: true });

  const downloadedFile = await waitFor(async () => {
    const files = await readdir(context.downloadDirectory);
    return files.find((file) => file.endsWith(".json") && !file.endsWith(".crdownload"));
  }, "백업 파일이 내려받아지지 않았습니다.");
  assert.match(downloadedFile, /^감정일기-백업-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadedBackup = JSON.parse(
    await readFile(join(context.downloadDirectory, downloadedFile), "utf8"),
  );
  assert.equal(downloadedBackup.application, "감정일기");
  assert.equal(downloadedBackup.version, 1);
  assert.equal(Object.keys(downloadedBackup.entries).length, 1);

  await navigate("/analysis.html");
  const analysis = await evaluate(`(() => ({
    cards: document.querySelectorAll(".emotion-stat-card").length,
    selected: document.querySelector(".emotion-stat-card.is-selected")?.dataset.emotion,
    count: document.querySelector('[data-emotion="happy"] .stat-count')?.textContent,
    record: document.querySelector(".record-card p")?.textContent
  }))()`);
  assert.equal(analysis.cards, 6);
  assert.equal(analysis.selected, "happy");
  assert.equal(analysis.count, "1회");
  assert.equal(analysis.record, "Chrome 계열 브라우저 자동 검사 기록");

  await connection.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    sessionId,
  );
  const analysisMobile = await evaluate(`(() => ({
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    columns: getComputedStyle(document.querySelector(".emotion-stats")).gridTemplateColumns.split(" ").length,
    minHeight: Math.min(...Array.from(document.querySelectorAll("button, a"))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rect.height))
  }))()`);
  assert.equal(analysisMobile.noOverflow, true);
  assert.equal(analysisMobile.columns, 2);
  assert.ok(analysisMobile.minHeight >= 44);

  await navigate("/index.html");
  const mobileHome = await evaluate(`(() => {
    const calendar = document.querySelector(".calendar-panel").getBoundingClientRect();
    const entry = document.querySelector(".entry-panel").getBoundingClientRect();
    document.querySelector(".calendar-day:not(:disabled)").focus();
    const focusStyle = getComputedStyle(document.activeElement);
    return {
      stacked: entry.top >= calendar.bottom,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      focusedDate: document.activeElement.dataset.date,
      outlineWidth: parseFloat(focusStyle.outlineWidth)
    };
  })()`);
  assert.equal(mobileHome.stacked, true);
  assert.equal(mobileHome.noOverflow, true);
  assert.ok(mobileHome.focusedDate);
  assert.ok(mobileHome.outlineWidth >= 2);

  await connection.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    sessionId,
  );
  await connection.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    sessionId,
  );
  assert.ok(await evaluate('document.querySelector("#entry-title").textContent.length > 0'));

  await navigate("/index.html");
  const deleteDialogOpened = await evaluate(`(() => {
    document.querySelector(".calendar-day.has-entry").click();
    document.querySelector("#delete-entry").click();
    return document.querySelector("dialog.confirm-dialog")?.open ?? false;
  })()`, { userGesture: true });
  assert.equal(deleteDialogOpened, true);
  await evaluate('document.querySelector("dialog.confirm-dialog .button-danger").click()', {
    userGesture: true,
  });
  await waitFor(
    () => evaluate('document.querySelector("#entry-status").textContent === "새 기록"'),
    "삭제 확인 후 기록이 제거되지 않았습니다.",
  );

  const downloadedPath = join(context.downloadDirectory, downloadedFile);
  await setFileInput("#restore-file", downloadedPath);
  await waitFor(
    () => evaluate('document.querySelector("dialog.confirm-dialog")?.open ?? false'),
    "복구 확인 대화상자가 열리지 않았습니다.",
  );
  await evaluate('document.querySelector("dialog.confirm-dialog .button-danger").click()', {
    userGesture: true,
  });
  await waitFor(
    () => evaluate('document.querySelector("#entry-status").textContent === "저장된 기록"'),
    "백업 기록이 복구되지 않았습니다.",
  );

  await setFileInput("#restore-file", downloadedPath);
  await waitFor(
    () => evaluate('document.querySelector("dialog.confirm-dialog")?.open ?? false'),
    "복구 취소용 확인 대화상자가 열리지 않았습니다.",
  );
  await evaluate('document.querySelector("dialog.confirm-dialog .button-secondary").click()', {
    userGesture: true,
  });
  assert.equal(await evaluate('document.querySelector("#entry-status").textContent'), "저장된 기록");

  const invalidBackupPath = join(context.downloadDirectory, "invalid-backup.json");
  await writeFile(invalidBackupPath, "{not-json", "utf8");
  await setFileInput("#restore-file", invalidBackupPath);
  await waitFor(
    () => evaluate('document.querySelector(".toast-error")?.textContent.includes("JSON") ?? false'),
    "잘못된 백업 파일 오류가 표시되지 않았습니다.",
  );
  assert.equal(await evaluate('document.querySelector("#entry-status").textContent'), "저장된 기록");

  assert.deepEqual(connection.errors, []);
  console.log(`PASS ${browserName}: 홈·저장·분석·백업·모바일·키보드 검사 완료`);
} catch (error) {
  console.error(error);
  console.error(context.getDiagnostic());
  process.exitCode = 1;
} finally {
  if (connection !== browserConnection) {
    connection.close();
  }
  await stopBrowser(context, browserConnection);
}
