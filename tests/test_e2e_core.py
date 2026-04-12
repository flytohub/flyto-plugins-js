#!/usr/bin/env python3
"""
End-to-end test: flyto-core Python ↔ Node.js plugin via JSON-RPC stdio.

Spawns the echo test plugin as a subprocess (same as flyto-core runtime would),
sends handshake + invoke + ping + shutdown, verifies responses.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

PLUGIN_JS = Path(__file__).parent.parent / "packages" / "sdk" / "dist" / "echo-test-plugin.js"

async def send_recv(proc, method, params=None, msg_id=1):
    """Send a JSON-RPC request and read the response."""
    request = {"jsonrpc": "2.0", "method": method, "id": msg_id}
    if params:
        request["params"] = params

    line = json.dumps(request) + "\n"
    proc.stdin.write(line.encode())
    await proc.stdin.drain()

    raw = await asyncio.wait_for(proc.stdout.readline(), timeout=5.0)
    return json.loads(raw.decode().strip())


async def run_tests():
    assert PLUGIN_JS.exists(), f"Build first: {PLUGIN_JS}"

    # Spawn plugin — same as flyto-core runtime/process.py does
    proc = await asyncio.create_subprocess_exec(
        "node", str(PLUGIN_JS),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    passed = 0
    failed = 0

    try:
        # ── Test 1: Handshake ────────────────────────────
        res = await send_recv(proc, "handshake", {
            "protocolVersion": "0.1.0",
            "pluginId": "test/echo",
            "executionId": "e2e-test",
        }, msg_id=1)

        assert res["id"] == 1, f"Wrong id: {res}"
        result = res["result"]
        assert result["pluginVersion"] == "0.1.0", f"Wrong version: {result}"
        assert "echo" in result["steps"], f"Missing echo step: {result}"
        assert "add" in result["steps"], f"Missing add step: {result}"
        print("  PASS: handshake")
        passed += 1

        # ── Test 2: Invoke echo ──────────────────────────
        res = await send_recv(proc, "invoke", {
            "step": "echo",
            "input": {"message": "hello flyto"},
        }, msg_id=2)

        result = res["result"]
        assert result["ok"] is True, f"Not ok: {result}"
        assert result["data"]["echo"] == "hello flyto", f"Wrong echo: {result}"
        assert result["data"]["reversed"] == "otylf olleh", f"Wrong reverse: {result}"
        print("  PASS: invoke echo")
        passed += 1

        # ── Test 3: Invoke add ───────────────────────────
        res = await send_recv(proc, "invoke", {
            "step": "add",
            "input": {"a": 17, "b": 25},
        }, msg_id=3)

        result = res["result"]
        assert result["ok"] is True, f"Not ok: {result}"
        assert result["data"]["result"] == 42, f"Wrong sum: {result}"
        print("  PASS: invoke add")
        passed += 1

        # ── Test 4: Invoke with context ──────────────────
        res = await send_recv(proc, "invoke", {
            "step": "echo",
            "input": {"message": "ctx-test"},
            "context": {
                "execution_id": "exec-999",
                "browser_ws_endpoint": "ws://localhost:9222",
            },
        }, msg_id=4)

        result = res["result"]
        assert result["ok"] is True, f"Not ok: {result}"
        assert result["data"]["echo"] == "ctx-test", f"Wrong echo: {result}"
        print("  PASS: invoke with context")
        passed += 1

        # ── Test 5: Invoke unknown step ──────────────────
        res = await send_recv(proc, "invoke", {
            "step": "nonexistent",
            "input": {},
        }, msg_id=5)

        result = res["result"]
        assert result["ok"] is False, f"Should fail: {result}"
        assert result["error"]["code"] == "STEP_NOT_FOUND", f"Wrong error: {result}"
        print("  PASS: invoke unknown step returns error")
        passed += 1

        # ── Test 6: Invoke step that throws ──────────────
        res = await send_recv(proc, "invoke", {
            "step": "fail",
            "input": {},
        }, msg_id=6)

        result = res["result"]
        assert result["ok"] is False, f"Should fail: {result}"
        assert "intentional" in result["error"]["message"], f"Wrong error msg: {result}"
        print("  PASS: invoke throwing step returns error")
        passed += 1

        # ── Test 7: Ping ─────────────────────────────────
        res = await send_recv(proc, "ping", msg_id=7)

        result = res["result"]
        assert result["status"] == "ok", f"Ping failed: {result}"
        print("  PASS: ping")
        passed += 1

        # ── Test 8: Shutdown ─────────────────────────────
        res = await send_recv(proc, "shutdown", msg_id=8)

        result = res["result"]
        assert result["status"] == "shutdown", f"Shutdown failed: {result}"
        print("  PASS: shutdown")
        passed += 1

        # Wait for process to exit
        await asyncio.wait_for(proc.wait(), timeout=3.0)
        assert proc.returncode == 0, f"Non-zero exit: {proc.returncode}"
        print("  PASS: clean exit")
        passed += 1

    except Exception as e:
        print(f"  FAIL: {e}")
        failed += 1
        # Kill if still running
        if proc.returncode is None:
            proc.kill()
            await proc.wait()

    print(f"\n{'='*50}")
    print(f"E2E Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")

    return 1 if failed > 0 else 0


if __name__ == "__main__":
    print("E2E Test: Python (flyto-core) <-> Node.js (@flyto/plugin-sdk)")
    print("="*50)
    exit_code = asyncio.run(run_tests())
    sys.exit(exit_code)
