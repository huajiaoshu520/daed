# VLESS XHTTP / REALITY

The daed image includes official Xray v26.10.29 (commit
`0afec66085a85191e9dd2a4a6646c7c9a94688d1`, built with Go 1.27).
Import a `vless://` link with `type=xhttp` in Nodes, assign it to a group, and
apply the configuration. There is no separate SOCKS node or Xray configuration
to maintain. VLESS encryption is preserved when the node is edited.

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
publish to `ghcr.io/huajiaoshu520/daed`.

The Docker build runs the adapter integration tests using the bundled Xray,
then builds the normal dae eBPF objects and daed bundle. Native development
requires `xray` on PATH to run integration tests. Without it, the integration
test is explicitly skipped.

Local validation: TCP echo, UDP packets above 2048 bytes, REALITY handshake,
VLESS encryption, process-crash recovery, closure, gateway authentication and
network-option preservation. Frontend tests verify editing preserves the
XHTTP/REALITY/encryption parameters. OpenWrt LAN interception requires a real
router test; a successful local echo test does not establish that result.
