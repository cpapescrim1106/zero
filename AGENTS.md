## Networking and access
- Do not use localhost URLs when validating UI behavior. Use the Tailscale funnel URL: `https://maximus.taila6f62d.ts.net/zero/...`.
- If a service is restarted, ensure it binds to the expected funnel port (e.g., web on `PORT=3020`).
