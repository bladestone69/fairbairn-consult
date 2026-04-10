// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://fairbairn-consult.vercel.app',
  integrations: [
    starlight({
      title: 'Erenst Meyer Financial Advisor',
      description: 'Personal financial advice with structured long-term support',
      favicon: '/favicon.svg',
      social: [],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'About',
          items: [
            { label: 'About Erenst Meyer', slug: 'about' },
          ],
        },
        {
          label: 'Services',
          items: [
            { label: 'Services Overview', slug: 'services' },
          ],
        },
        {
          label: 'Advice Process',
          items: [
            { label: 'Overview', slug: 'advice-process' },
          ],
        },
        {
          label: 'Reviews',
          items: [
            { label: 'Ongoing Review Service', slug: 'reviews' },
          ],
        },
        {
          label: 'Documents',
          items: [
            { label: 'All Documents', slug: 'documents' },
            { label: 'Brochures', slug: 'documents/brochures' },
            { label: 'Forms', slug: 'documents/forms' },
            { label: 'Disclosures', slug: 'documents/disclosures' },
            { label: 'Advice Process Documents', slug: 'documents/advice-process' },
            { label: 'Regulatory & Policies', slug: 'documents/regulatory' },
          ],
        },
        {
          label: 'Compliance',
          items: [
            { label: 'Compliance Overview', slug: 'compliance' },
            { label: 'Privacy & Personal Information', slug: 'compliance/privacy' },
            { label: 'Complaints Process', slug: 'compliance/complaints' },
          ],
        },
        {
          label: 'Contact',
          items: [
            { label: 'Contact', slug: 'contact' },
          ],
        },
      ],
    }),
  ],
});
