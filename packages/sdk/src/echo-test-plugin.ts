// Minimal test plugin for e2e testing with flyto-core
import { createPlugin } from "./index.js";

const plugin = createPlugin({ id: "test/echo", version: "0.1.0" });

plugin.step("echo", async (input) => ({
  ok: true,
  data: { echo: input.message, reversed: String(input.message).split("").reverse().join("") },
}));

plugin.step("add", async (input) => ({
  ok: true,
  data: { result: Number(input.a) + Number(input.b) },
}));

plugin.step("fail", async () => {
  throw new Error("intentional test failure");
});

plugin.start();
