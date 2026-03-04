Infrastructure (Hybrid v2):

- VPS (General):
  - Ubuntu (Hostinger)
  - Role: 24/7 Listener (Telegram/Discord), Shared Memory Hub (Supabase), Dashboard
  - Services: bmad-proxy, tg-voice, bmad-dashboard, openclaw-gateway
- Mac (Soldier):
  - macOS (MacBook Pro)
  - Role: GUI Execution, Vision, Physical Hands
  - Connectivity: Secure local bridge (port 5555) via Tailscale
- Connectivity: Tailscale Mesh (Secure tunnel VPS <-> Mac)

Security Constraints:

- Tailscale-only exposure
- Token-authenticated bridge (BRIDGE_TOKEN)
- Shared Supabase brain (identical .env keys)
