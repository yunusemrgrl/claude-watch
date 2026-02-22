# TDD Enforcement Hook

Warns when a new source file is created without a corresponding test file.

## Naming Conventions Checked

| Source file          | Expected test file                  |
|----------------------|-------------------------------------|
| src/foo.ts           | tests/foo.test.ts or foo.spec.ts    |
| src/core/bar.ts      | tests/core/bar.test.ts              |
| lib/baz.py           | test_baz.py or baz_test.py          |
| pkg/qux.go           | qux_test.go                         |

## Skip List (configure in .claudedash/config.json)

```json
{
  "tddHook": {
    "skipPatterns": ["src/cli.ts", "src/server/server.ts", "**/*.d.ts"]
  }
}
```

## Hook Configuration

```json
{
  "hook": "PostToolUse",
  "matcher": { "tool_name": ["Write"], "file_pattern": "src/**/*.ts" },
  "script": ".claudedash/hooks/tdd-check.sh"
}
```

## Behavior

- If a matching test file exists → silent pass
- If no test file found → prints a warning (does NOT block)
- Agent should create the test file before marking the task DONE
