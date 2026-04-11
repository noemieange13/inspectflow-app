This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Rapports PDF (Supabase Edge)

- **Entrée unique** pour l’app : `report_id` (ligne `reports` existante).
- **Appel serveur uniquement** : `lib/triggerInspectionUltimate.ts` — requiert `SUPABASE_SERVICE_ROLE_KEY`.
- **Slug** par défaut : `reports-pdf` (surcharge : `REPORTS_PDF_SLUG`).

Contrat, réponse (`cached` vs signed URL régénérée), flux Mermaid et storage privé : **[docs/reports-pdf-pipeline.md](docs/reports-pdf-pipeline.md)**.

Vision d’ensemble (pipeline unique, dépollution des Edge Functions, phases) : **[docs/integration-roadmap.md](docs/integration-roadmap.md)**.

Variables d’environnement (modèle sans secrets) : **`.env.example`** → copier vers `.env.local` ou configurer sur Vercel.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
