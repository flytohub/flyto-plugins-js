# Integration Tests

- `test_plugin_runtime.py` exercises correlated JSON-RPC calls, notifications,
  shutdown, and child-process lifecycle against the built SDK fixture.
- `test_e2e_core.py` sends the Core-shaped handshake, invoke, ping, failure, and
  shutdown sequence over real stdin/stdout pipes.

`npm run test:integration` runs both after `npm run build` has produced current
JavaScript output.
