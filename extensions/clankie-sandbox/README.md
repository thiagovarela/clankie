# clankie-sandbox

Runs bash commands inside a [Gondolin](https://github.com/earendil-works/gondolin) micro-VM. Transparent — just turn it on and all shell execution is sandboxed.

File tools (read/write/edit) stay on the host as-is — workspace-jail handles those. The workspace is mounted into the VM via VFS, so bash commands see the same files.

## Setup

Requires QEMU (Linux) or libkrun (macOS Apple Silicon).

```json5
// ~/.clankie/clankie.json
{ "sandbox": { "enabled": true } }
```

That's it. Every `bash` tool call and `!` command now runs inside a VM.

## Optional: network policy

By default the VM can reach any host. A built-in safety blocklist blocks cloud metadata endpoints (`169.254.169.254`, etc.).

```json5
{
  "sandbox": {
    "enabled": true,
    "network": {
      // Block additional hosts
      "blockedHosts": ["*.internal.corp.net"],

      // Inject secrets into the HTTP layer
      "secrets": {
        "API_KEY": "sk-...",
        "SCOPED_KEY": { "value": "token", "hosts": ["api.example.com"] }
      },

      // Or go strict: only these hosts are reachable
      // "mode": "allowlist",
      // "allowedHosts": ["api.openai.com", "*.github.com"]
    }
  }
}
```
