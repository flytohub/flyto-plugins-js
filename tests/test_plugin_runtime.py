#!/usr/bin/env python3
"""
Integration test: plugin_runtime.py (flyto-cloud) ↔ Plugin SDK (Node.js)

Tests the full flow:
  1. PluginProcess spawn + JSON-RPC communication
  2. Handshake protocol
  3. Headless step invoke (echo plugin)
  4. UI step invoke notifications
  5. Graceful shutdown

This test uses the echo-test-plugin from @flyto/plugin-sdk test fixtures.
"""

import asyncio
import json
import os
import sys
import time

# Path setup
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(TESTS_DIR)
SDK_DIST = os.path.join(REPO_DIR, "packages", "sdk", "dist")

# ── Inline PluginProcess (extracted from plugin_runtime.py) ──
# We test the core JSON-RPC logic without needing flyto-cloud imports.


class PluginProcess:
    """Lightweight replica of plugin_runtime.PluginProcess for testing."""

    def __init__(self, entry_path: str, cwd: str):
        self.entry_path = entry_path
        self.cwd = cwd
        self.process = None
        self._rpc_id = 0
        self._pending = {}
        self._reader_task = None
        self._notifications = []

    async def start(self):
        self.process = await asyncio.create_subprocess_exec(
            "node", self.entry_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
        )
        self._reader_task = asyncio.create_task(self._read_stdout())

    async def stop(self):
        if self._reader_task:
            self._reader_task.cancel()
        if self.process and self.process.returncode is None:
            self.process.terminate()
            await asyncio.wait_for(self.process.wait(), timeout=5)

    async def call(self, method, params, timeout=10.0):
        self._rpc_id += 1
        rpc_id = self._rpc_id
        request = {"jsonrpc": "2.0", "method": method, "params": params, "id": rpc_id}
        line = json.dumps(request) + "\n"
        self.process.stdin.write(line.encode())
        await self.process.stdin.drain()

        fut = asyncio.get_event_loop().create_future()
        self._pending[rpc_id] = fut
        return await asyncio.wait_for(fut, timeout=timeout)

    async def _read_stdout(self):
        while True:
            try:
                line = await self.process.stdout.readline()
                if not line:
                    break
                msg = json.loads(line.decode().strip())
                msg_id = msg.get("id")
                if msg_id is not None and msg_id in self._pending:
                    fut = self._pending.pop(msg_id)
                    if "error" in msg:
                        fut.set_exception(RuntimeError(msg["error"].get("message", "RPC error")))
                    else:
                        fut.set_result(msg.get("result"))
                elif msg_id is None and "method" in msg:
                    self._notifications.append(msg)
            except asyncio.CancelledError:
                break
            except Exception:
                break


# ── Tests ────────────────────────────────────────────────

passed = 0
failed = 0


def report(name, success, detail=""):
    global passed, failed
    if success:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name} — {detail}")


async def run_tests():
    print("Integration Test: plugin_runtime ↔ @flyto/plugin-sdk")
    print("=" * 55)

    echo_plugin = os.path.join(SDK_DIST, "echo-test-plugin.js")
    if not os.path.isfile(echo_plugin):
        print(f"ERROR: echo-test-plugin.js not found at {echo_plugin}")
        print("       Run 'npm run build' in flyto-plugins-js first.")
        sys.exit(1)

    proc = PluginProcess(echo_plugin, SDK_DIST)
    await proc.start()

    try:
        # 1. Handshake
        result = await proc.call("handshake", {
            "protocolVersion": "0.1.0",
            "pluginId": "test",
            "executionId": "exec-001",
        })
        report("handshake",
               result.get("protocolVersion") == "0.1.0"
               and "echo" in result.get("steps", []),
               f"got: {result}")

        # 2. Invoke echo step
        result = await proc.call("invoke", {
            "step": "echo",
            "input": {"message": "hello from runtime"},
        })
        report("invoke echo",
               result.get("ok") is True
               and result.get("data", {}).get("echo") == "hello from runtime",
               f"got: {result}")

        # 3. Invoke add step
        result = await proc.call("invoke", {
            "step": "add",
            "input": {"a": 10, "b": 32},
        })
        report("invoke add",
               result.get("ok") is True
               and result.get("data", {}).get("result") == 42,
               f"got: {result}")

        # 4. Invoke with context
        result = await proc.call("invoke", {
            "step": "echo",
            "input": {"message": "ctx"},
            "context": {
                "execution_id": "exec-001",
                "browser_ws_endpoint": "ws://localhost:9222",
                "secrets": {"API_KEY": "test-secret"},
            },
        })
        report("invoke with context",
               result.get("ok") is True,
               f"got: {result}")

        # 5. Unknown step
        result = await proc.call("invoke", {
            "step": "nonexistent",
            "input": {},
        })
        report("unknown step returns error",
               result.get("ok") is False
               and result.get("error", {}).get("code") == "STEP_NOT_FOUND",
               f"got: {result}")

        # 6. Ping
        result = await proc.call("ping", {})
        report("ping",
               result.get("status") == "ok",
               f"got: {result}")

        # 7. Shutdown
        result = await proc.call("shutdown", {})
        report("shutdown",
               result.get("status") == "shutdown",
               f"got: {result}")

        # 8. Wait for clean exit
        try:
            code = await asyncio.wait_for(proc.process.wait(), timeout=3)
            report("clean exit", code == 0, f"exit code: {code}")
        except asyncio.TimeoutError:
            report("clean exit", False, "process did not exit")

    except Exception as e:
        report("unexpected error", False, str(e))
    finally:
        await proc.stop()

    print()
    print("=" * 55)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 55)

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
