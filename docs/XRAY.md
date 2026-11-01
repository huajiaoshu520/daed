# VLESS XHTTP / REALITY

The daed image includes official Xray v26.10.31 (commit
`a4a3dff5b20c2faae567b742c172c7b95e75c083`, built with Go 1.27).
Import a `vless://` link with `type=xhttp` in Nodes, assign it to a group, and
apply the configuration. There is no separate SOCKS node or Xray configuration
to maintain. VLESS encryption is preserved when the node is edited.

## Core management

Open **Xray** in the header (the CPU icon on mobile). The panel shows the selected
core version, mode and executable path. Administrator authentication is required
for every core query and operation.

- **Download and switch** lists official XTLS/Xray-core releases for this platform.
  The archive is verified against GitHub's SHA256 asset digest before extracting
  only the Xray executable. The executable version and current XHTTP node
  configurations are checked before activating it. A failed download, digest,
  executable or configuration check keeps the current selection and workers.
- **System / custom core** accepts an absolute executable path, or finds `xray`
  on `PATH` if empty. System package upgrades at that path are picked up on the
  next XHTTP dial. A custom executable must be trusted by the administrator.
- **Restore bundled core** uses the installation/image's `xray` on `PATH`.
  **Return to previous selection** validates and reselects the previous core.

Switching closes existing XHTTP connections; they reconnect on demand. Other dae
protocols are unaffected. Validation checks local configuration compatibility,
not connectivity to a remote server. Use the rollback button if a new release
does not work with your server.

Downloads and selection are saved under `<config-directory>/xray/` (by default
`/etc/daed/xray/`). Keep `/etc/daed` mounted as a persistent volume when recreating
Docker containers. Selection is saved atomically only after validation; downloads
are staged separately and never overwrite a running executable.

In Docker, custom paths refer to **the container**, not the host. To use a host
Xray, bind-mount a compatible, preferably static binary read-only, for example
`/usr/bin/xray:/opt/system-xray:ro`, and enter `/opt/system-xray` in the panel.
Package managers may replace bind-mounted files using rename; recreate the
container after a host upgrade if the bind mount still points to the old inode.

Automatic downloads support Linux amd64/arm64/386; other architectures can use a
custom binary. GitHub must be reachable from daed. Only releases with a SHA256
asset digest appear; prereleases are marked. No background unattended update is
enabled, so deployments retain their selected core until explicitly changed.

Supported: XHTTP auto, packet-up, stream-up and stream-one; REALITY and TLS
(HTTP/2 or HTTP/1.1); TCP and UDP payloads; `encryption=none` and Xray's
`mlkem768x25519plus` encryption. Encrypted XHTTP links also support
`flow=xtls-rprx-vision` and `flow=xtls-rprx-vision-udp443`; the server account
must have the corresponding Vision flow enabled. XHTTP Vision without VLESS
encryption is rejected because its HTTP connection does not expose the outer
TLS/REALITY connection required by Vision. Existing non-XHTTP VLESS nodes retain the native dae dialer.

The editor preserves the encryption string, Vision flow, REALITY fields,
`x_padding_bytes`, `extra`, and the `support-x25519mlkem768` exporter hint.
`x_padding_bytes` supplies `extra.xPaddingBytes` when that field is absent;
explicit `extra.xPaddingBytes` wins. The exporter hint is not an Xray JSON
setting: REALITY key shares are negotiated by the bundled core and uTLS.

## How it works

The wing package `component/xray` registers the XHTTP VLESS adapter. Importing
nodes performs validation without starting processes. A selected node starts
Xray on first use (including health checks). Each dialer/network variant owns
its process; it is reaped when the node is closed and restarted on the next
request if it exits unexpectedly. Health-checked nodes can therefore retain
Xray processes even without user traffic. Large node groups use more memory
than native dae protocols.

Traffic follows:

```
LAN -> dae -> private local SOCKS -> Xray VLESS/XHTTP/REALITY
                                      |
                             private local gateway
                                      |
                       dae's original outbound dialer -> server
```

Xray's transport uses `dialerProxy` to reach the gateway. The gateway uses the
dae dialer supplied to the adapter, preserving its DNS, sticky-IP, socket mark,
MPTCP and IP-family handling. No Xray freedom/direct outbound is configured in
the client. Both local listeners bind to 127.0.0.1 and use random credentials.
Configuration travels over stdin; node credentials are not stored in temporary
files or command-line arguments. Xray logs are disabled to avoid leaking link
credentials in configuration errors.

Payload still crosses dae's user-space forwarding and its runtime counters.
This does not add whole-interface traffic or pure eBPF/Real Direct accounting.

## Limits and validation

Separate `extra.downloadSettings`, HTTP/3 and ECH are rejected by this initial
adapter. Ordinary XHTTP extra settings are passed through. Xray validates
transport-specific settings at startup; a startup error is reported to dae.
This is a client integration, not an Xray server-management panel.

Docker builds use the committed wing and dae-core submodule revisions, including
in CI. Pull requests build the same image without publishing it; main builds
publish to `ghcr.io/longdongqiang-jason/daed`.

The Docker build runs the adapter integration tests using the bundled Xray,
then builds the normal dae eBPF objects and daed bundle. Native development
requires `xray` on PATH to run integration tests. Without it, the integration
test is explicitly skipped.

Local validation: TCP echo, UDP packets above 2048 bytes, REALITY handshake,
VLESS encryption, process-crash recovery, closure, gateway authentication and
network-option preservation. Frontend tests verify editing preserves the
XHTTP/REALITY/encryption parameters. OpenWrt LAN interception requires a real
router test; a successful local echo test does not establish that result.
