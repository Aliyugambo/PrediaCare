Carenix — Next.js migration

This repository contains a scaffold for migrating the existing HTML/CSS site into a Next.js + TypeScript project.

Quick start

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

Notes

- Static `assets/` and `style.css` are currently left in place. Next step is to copy them into `public/` and `styles/` and update paths.
- The initial pages `pages/sign-in.tsx`, `pages/register.tsx`, `pages/patient-dashboard.tsx` and `pages/doctor-dashboard.tsx` are provided as examples.
- For real authentication and role-based protection, integrate a backend or NextAuth.js later.
