# Token-Efficient Tooling

Use the cheapest tool that can answer the current question, and narrow the
scope before reading implementation bodies.

## Search and reading order

1. Read the workspace `CONTEXT.md` and the selected entries in
   `repository-catalog.yaml`.
2. Use code intelligence or language-server tools when the client provides
   them.
3. Use `ast-grep outline <file-or-directory>` to inspect imports, exports,
   declarations, and direct members before opening full source files.
4. Use `rg` for exact names, strings, paths, configuration keys, and simple
   regular expressions. Always constrain searches with a directory, file glob,
   language type, context count, or result limit when possible.
5. Use `ast-grep run` for direct syntax patterns and `ast-grep scan` for
   structural or relational rules that text search cannot express safely.
6. Read only the ranges or files surfaced by the preceding steps. Do not repeat
   the same search with multiple tools unless the first result is incomplete.

## RTK output compression

Use RTK for shell commands whose raw output is noisy:

```bash
rtk git status
rtk git diff
rtk rg "pattern" src
rtk pnpm test
rtk test flutter test
rtk err pnpm build
```

Use `rtk proxy <command>` when exact raw output is required but the command
should still be tracked. Do not wrap native IDE, code-intelligence, file-view,
or patch tools with RTK; they already return structured output.

RTK reports estimated Bash-output savings, not total model-token or billing
savings. Use `rtk gain` and `rtk discover` to inspect adoption without treating
the estimates as exact tokenizer counts.

## Structural search examples

```bash
# Cheap public-surface map
ast-grep outline src --items exports --view names

# File structure before a targeted read
ast-grep outline src/modules/example.ts --view expanded

# Exact text search
rtk rg "createEntityApi" src --glob "*.ts"

# AST-aware search
ast-grep run --pattern 'console.log($ARG)' --lang typescript src
```

For complex `ast-grep scan` rules using `inside` or `has`, use
`stopBy: end` unless a deliberately narrower traversal is required.
