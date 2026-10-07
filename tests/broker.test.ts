import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { LocalBridgeBroker } from "../src/broker.js";

function openClient(url: string, app = "photoshop") {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("client_open_timeout")), 3000);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "hello",
        app,
        appVersion: "test",
        adapterVersion: "test",
        capabilities: [app + ".context.inspect"]
      }));
    });
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.type === "hello-ack") {
        clearTimeout(timer);
        resolve(socket);
      }
    });
    socket.on("error", reject);
  });
}

function attachEcho(socket: WebSocket) {
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.type !== "command") return;
    socket.send(JSON.stringify({
      type: "result",
      id: message.id,
      ok: true,
      data: { echoed: message.op, params: message.params }
    }));
  });
}

test("broker accepts host reconnect without MCP restart", async () => {
  const port = 39000 + (process.pid % 1000);
  const broker = new LocalBridgeBroker(port);
  await broker.start();

  try {
    const first = await openClient("ws://127.0.0.1:" + port);
    attachEcho(first);
    const one = await broker.invoke("photoshop", "photoshop.context.inspect", { pass: 1 }, 3000);
    assert.equal(one.ok, true);
    assert.deepEqual(one.data, { echoed: "photoshop.context.inspect", params: { pass: 1 } });

    await new Promise<void>((resolve) => {
      first.once("close", () => resolve());
      first.close();
    });

    const disconnected = await broker.invoke("photoshop", "photoshop.context.inspect", {}, 1000);
    assert.equal(disconnected.ok, false);
    assert.match(disconnected.error ?? "", /adapter_not_connected/);

    const second = await openClient("ws://127.0.0.1:" + port);
    attachEcho(second);
    const two = await broker.invoke("photoshop", "photoshop.context.inspect", { pass: 2 }, 3000);
    assert.equal(two.ok, true);
    assert.deepEqual(two.data, { echoed: "photoshop.context.inspect", params: { pass: 2 } });
    second.close();
  } finally {
    await broker.close();
  }
});
