# zabroker

Production website project for **Erenst Meyer Financial Advisor**.

## Stack
- Astro
- Starlight
- Vercel

## Purpose
This site is being adapted from a Starlight starter into a premium financial adviser website with:
- Erenst Meyer as the public-facing adviser brand
- Fairbairn kept secondary as broker / licensing / operational context where relevant
- a structured advice-process section
- a client-facing documents centre
- compliance and regulatory support pages

## Local development
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
```

## Environment variables
- `XAI_API_KEY` - required for the Ara voice receptionist session endpoint.
- `CONTACT_WEBHOOK_URL` - optional but recommended; receives callback and appointment request payloads from serverless functions.
- `CONTACT_WEBHOOK_SECRET` - optional bearer token sent to `CONTACT_WEBHOOK_URL`.

## Deployment
The project is linked to Vercel and the intended production URL is:
- https://www.financial-advisor.co.za

## Current known issues
- Vercel production deployments have intermittently failed with a platform-side "Unexpected error" while the local build succeeds.
- Some document sections still need final approved public files.
- Voice-agent lead delivery should be connected to a production `CONTACT_WEBHOOK_URL` destination before relying on it as the primary contact channel.

## Key content areas
- Home
- About
- Services
- Advice Process
- Reviews
- Compliance
- Documents
- Contact
