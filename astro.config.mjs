// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://www.financial-advisor.co.za',
  integrations: [
    starlight({
      title: 'Erenst Meyer Financial Advisor',
      description: 'Personal financial advice with structured long-term support',
      favicon: '/favicon.svg',
      social: [],
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://www.financial-advisor.co.za/brand-assets/social-card.svg',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content: 'Erenst Meyer Financial Advisor - personal financial advice with structured long-term support',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://www.financial-advisor.co.za/brand-assets/social-card.svg',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#251f1b',
          },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        PageFrame: './src/components/overrides/PageFrame.astro',
      },
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
          label: 'Planning Tools',
          items: [
            { label: 'Interactive Calculators', slug: 'planning-tools' },
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