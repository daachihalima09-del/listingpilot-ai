import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          200: '#ffe4a3',
          300: '#ffd369',
          400: '#f5b942',
        },
      },
      boxShadow: {
        soft: '0 24px 80px rgba(0, 0, 0, 0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
