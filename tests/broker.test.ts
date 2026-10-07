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

test("broker supports reconnecting HTTP-poll host adapters", async () => {
  const port = 40000 + (process.pid % 1000);
  const broker = new LocalBridgeBroker(port);
  await broker.start();

  try {
    const base = "http://127.0.0.1:" + port + "/adapter/lightroom-classic";
    const hello = await fetch(base + "/hello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appVersion: "15-test",
        adapterVersion: "test",
        capabilities: ["lightroom-classic.catalog.manage"]
      })
    });
    assert.equal(hello.status, 200);

    const pending = broker.invoke(
      "lightroom-classic",
      "lightroom-classic.catalog.manage",
      { operation: "inspect" },
      3000
    );

    const poll = await fetch(base + "/poll");
    assert.equal(poll.status, 200);
    const command = await poll.json() as any;
    assert.equal(command.type, "command");
    assert.equal(command.op, "lightroom-classic.catalog.manage");

    const resultResponse = await fetch(base + "/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "result",
        id: command.id,
        ok: true,
        data: { catalog: "ok" }
      })
    });
    assert.equal(resultResponse.status, 200);

    const result = await pending;
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, { catalog: "ok" });

    const eventResponse = await fetch(base + "/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "event",
        event: "context",
        data: { selectedPhotos: 2 }
      })
    });
    assert.equal(eventResponse.status, 200);
    assert.deepEqual(broker.state.get("lightroom-classic").context, { selectedPhotos: 2 });
  } finally {
    await broker.close();
  }
});
