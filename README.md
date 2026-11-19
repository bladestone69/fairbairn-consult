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
- `PUBLIC_ELEVENLABS_AGENT_ID` optionally overrides the published ID in `src/ara.ts`. Set it to an empty value to disable the assistant while keeping the callback form available. Redeploy after changing it.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `CALLBACK_RECIPIENT` are server-only settings for callback email delivery.
- `CONTACT_WEBHOOK_URL` is used by the separate appointment request endpoint.
- `CONTACT_WEBHOOK_SECRET` - optional bearer token sent to `CONTACT_WEBHOOK_URL`.

## Ara on ElevenLabs

Use a dedicated public voice agent for this website. In its security settings, allow the production hostname `www.financial-advisor.co.za`. Add a preview hostname only when testing it. The website uses the public agent ID and the ElevenLabs browser SDK.

Set the first message to “Hi, I’m Ara, Erenst Meyer’s AI receptionist. Would you like me to help prepare a callback request?”

Set the agent instructions to the following.

> You are Ara, Erenst Meyer's AI receptionist in South Africa. Speak warmly, one short question at a time. Erenst works with Fairbairn Consult and has advised clients since 2005. Your role is to help visitors request a call from him. Refer financial, tax, product and investment questions to Erenst. Avoid giving advice or promising an appointment or a response time. Ask for the visitor's name and phone number only when they want a callback. Optionally ask for a convenient time and a short topic. Ask visitors to keep identity numbers, accounts, balances and medical information out of the conversation. Read the phone number back in groups and ask if the details are correct. With their agreement, call prepare_callback. Once the draft is ready, tell them to review the form and select Request a call back. Only the form can send a request. If the tool is unavailable, direct them to the form or to Erenst on 083 290 9399.

In the agent's tools, attach a **client tool** named `prepare_callback`. Set it to wait for a response. It prepares the form on the visitor's screen. Use string parameters `name` and `phone` (required), and `preferred_time` and `reason` (optional). Publish the agent after saving the instructions and tool.

To check a new agent, start a call on the contact page, confirm sample details and check the draft in the form. End the call without submitting the draft to avoid sending a test lead.

## Deployment
The project is linked to Vercel and the intended production URL is:
- https://www.financial-advisor.co.za

## Current known issues
- Vercel production deployments have intermittently failed with a platform-side "Unexpected error" while the local build succeeds.
- Some document sections still need final approved public files.

## Key content areas
- Home
- About
- Services
- Advice Process
- Reviews
- Compliance
- Documents
- Contact
