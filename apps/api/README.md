# Stock Transfer Agent Backend (NestJS)

This repository contains the **NestJS** backend for an AI‑native stock transfer agent. It is designed as a modular monolith so that you can get up and running quickly and later graduate individual modules into their own services if needed. The backend provides a canonical ledger for share issuance and transfers, a simple case/workflow engine, and stubs for evidence ingestion and policy evaluation.

## Features

This MVP implements the core building blocks required to operate a stock transfer agent as described in the accompanying pitch deck. Transfer agents are responsible for maintaining the official record of a company’s issued and outstanding shares and their registered holders【531892594726359†L7-L19】, enabling issuance and transfer of shares【531892594726359†L14-L19】, and handling shareholder inquiries, corporate actions and compliance reporting【531892594726359†L20-L36】. The modules included here provide:

- **Ledger service** – an append‑only event log with materialized positions. This ledger records share issuances, transfers and cancellations and exposes endpoints to query current positions per security/holder.
- **Case/workflow service** – a simple state machine that tracks transfer requests and their progress. Each case can be used to coordinate multi‑step processes (e.g. collecting documents, verifying identity) and to assign tasks to operations staff. While the full range of stakeholder engagement and lost shareholder recovery is beyond the scope of this MVP, the case service provides a foundation to build upon.
- **Evidence service (stub)** – placeholder endpoints for uploading documents, such as stock powers or medallion guarantees. In a production system these would be stored in encrypted object storage and linked to cases.
- **Rules service (stub)** – placeholder functions to evaluate transfer eligibility (e.g. restrictions, legends) and to return required documentation checklists. You can integrate your own policy engine here.
- **In‑memory persistence** – for demonstration purposes the ledger and cases are stored in memory. You can replace the repositories with a database implementation (e.g. PostgreSQL) by implementing the provided interfaces.

## Requirements

- Node.js 18 or later
- npm 9 or later
- (Optional) A relational database such as PostgreSQL if you wish to persist data

## Getting started

1. **Install dependencies**

   ```bash
   cd stock-transfer-agent-backend
   npm install
   ```

2. **Configure environment**

   Copy the provided example environment file and adjust it as needed. By default the application stores everything in memory and runs on port `3002`.

   ```bash
   cp .env.example .env
   # edit .env to set custom PORT or database credentials
   ```

3. **Run the server**

   ```bash
   npm run start:dev
   ```

   The API will be available at [http://localhost:3002](http://localhost:3002). You should see “Hello World!” when you visit the root route.

4. **Build for production**

   ```bash
   npm run build
   npm run start
   ```

## API endpoints

These routes provide a starting point; you can extend or version them as your product matures.

### Ledger endpoints

- `GET /ledger/events` – returns the full list of ledger events (issuance, transfer, cancellation).
- `POST /ledger/issue` – create a new issuance. Expects a body with `securityId`, `holderId` and `quantity`.
- `POST /ledger/transfer` – transfer shares from one holder to another. Expects `securityId`, `fromHolderId`, `toHolderId` and `quantity`.

### Case endpoints

- `GET /cases` – list all cases.
- `GET /cases/:id` – fetch a specific case by ID.
- `POST /cases` – create a new case. Expects a body with `type` (e.g. `TRANSFER`), `securityId`, `fromHolderId`, `toHolderId`, and `quantity`. The case service will create an initial case and emit tasks based on your rules. In this MVP, the case is completed immediately.

### Evidence and rules endpoints (stubs)

- `POST /evidence/upload` – returns a fake pre‑signed URL for file upload. In a production system you would call your object store here.
- `POST /rules/evaluate` – returns a placeholder checklist for required documents based on the request type.

## Integrating with the Next.js frontend

The Next.js UI expects an environment variable called `NEXT_PUBLIC_API_URL` to point at your backend. For local development you can create a `.env.local` file in the frontend repository with the following contents:

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
```

When the frontend sends requests to `/ledger/issue`, `/ledger/transfer`, `/cases`, etc., they will be proxied to the backend server defined above. See the **frontend README** for more details.

## Extending this MVP

This project lays the groundwork for a much more capable system. Future improvements might include:

- Replacing the in‑memory repositories with persistent storage (PostgreSQL, MongoDB or event streams such as Kafka) to fulfil the regulatory requirement to “make and keep current operational records”【531892594726359†L139-L146】.
- Implementing strong identity verification, authority checks and medallion signature guarantees as required for transfer agents【531892594726359†L148-L155】.
- Adding modules for dividend payment processing, stakeholder engagement and compliance reporting【531892594726359†L20-L36】.
- Incorporating AI‑powered document classification and extraction to automatically triage incoming evidence and accelerate case resolution.

Feel free to tailor the architecture to your specific business model and regulatory jurisdiction. If you plan to operate in the US you will need to file Form TA‑1 with the SEC and prepare for the ongoing Form TA‑2 reporting requirements【531892594726359†L127-L133】. Consult legal counsel for guidance on compliance and licensing.
