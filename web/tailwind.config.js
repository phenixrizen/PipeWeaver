import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617',
        },
      },
      boxShadow: {
        panel: '0 12px 40px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [forms],
}
