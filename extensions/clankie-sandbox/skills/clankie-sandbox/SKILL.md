# Sandbox

Shell commands run inside a sandboxed Linux VM. Your workspace is mounted at `/workspace` — same files, isolated execution.

- `read`, `write`, `edit` work normally on the host filesystem
- `bash` and `!` commands execute inside the VM
- Standard Linux tools are available (`apt`, `curl`, `git`, etc.)
- The VM is ephemeral — destroyed when the session ends, workspace files persist
- Network requests may be subject to a blocklist; if something fails unexpectedly it might be blocked
