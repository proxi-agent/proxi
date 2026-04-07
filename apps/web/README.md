# Stock Transfer Agent Frontend (Next.js)

This repository contains a simple **Next.js** user interface for the AI‑native stock transfer agent described in the accompanying deck. The UI allows you to view ledger events and positions, create share issuances and transfers, and open cases for more complex workflows. It is intentionally minimal so that you can extend it to meet your own product and branding requirements.

## Features

- Home page with links to ledger and case management
- Ledger page with:
  - Form to issue new shares (security ID, holder ID, quantity)
  - Form to transfer shares between holders
  - Table of current positions aggregated by security and holder
  - Table of ledger events showing issuances and transfers
- Cases page with:
  - Form to create cases of type `TRANSFER`, `ISSUE` or `CANCEL` with relevant fields
  - Table of existing cases with status and creation date

The UI is styled with a few simple utility classes; feel free to swap these out for your favourite component library (e.g. Tailwind, Chakra UI).

## Getting started

1. **Install dependencies**

   ```bash
   cd stock-transfer-agent-next
   npm install
   ```

2. **Configure environment**

   Create a `.env.local` file in the project root. Define the URL of your backend API so the frontend knows where to send requests:

   ```env
   # Where your NestJS backend is running
   NEXT_PUBLIC_API_URL=http://localhost:3002
   ```

3. **Run the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001) with your browser to see the app. You should be able to issue shares, transfer them and view cases. Make sure you have the backend running as described in its README.

4. **Build for production**

   ```bash
   npm run build
   npm run start
   ```

   This builds the app for production and starts a Node.js server on port 3001.

## Extending the UI

This project is deliberately simple to make it easy to iterate. Some ideas for extensions:

- **Authentication and roles** – integrate with your preferred auth provider and protect routes based on roles (issuer, shareholder, transfer agent).
- **Responsive design** – improve the layout and add responsive breakpoints so the interface works well on mobile devices.
- **Dashboard** – add graphs and metrics such as the number of active cases, median transfer time or dividend payments, inspired by the deck’s call for better reporting and analytics【531892594726359†L55-L60】.
- **Notifications** – display toast messages when cases change status or new evidence is requested.

Feel free to customise the component structure and styling. The goal is to provide a launchpad for experimenting with the concept of a modern, AI‑enabled transfer agent.
