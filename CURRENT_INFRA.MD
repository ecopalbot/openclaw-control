Infrastructure:

- VPS: Ubuntu (Hostinger)
- Access: Tailscale only
- Firewall: Default drop inbound
- OpenClaw installed globally via npm
- systemd service enabled
- gateway.mode=local
- token auth enabled

Security Constraints:

- Do not expose OpenClaw publicly
- Do not open public ports
- All access must go through Tailscale or SSH tunnel