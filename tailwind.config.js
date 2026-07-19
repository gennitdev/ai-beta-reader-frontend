import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'

/**
 * Beta-bot brand palette (from the moth-and-book logo)
 * navy   #00132f  page background / dark surfaces
 * gold   #dbab5d  primary accent
 * cream  #fae8cd  light text / highlights on navy
 */
const gold = {
  50: '#faf6ea',
  100: '#f4eccf',
  200: '#ead29a',
  300: '#deba63',
  400: '#d3a63f',
  500: '#c19230',
  600: '#a2761f',
  700: '#815a18',
  800: '#67471a',
  900: '#583c19',
  950: '#331f0a',
}

const navy = {
  50: '#eef2f7',
  100: '#d3dde9',
  200: '#a7bad3',
  300: '#7091b5',
  400: '#456b95',
  500: '#2b4d73',
  600: '#1d3a5c',
  700: '#122a47',
  800: '#0a2140',
  900: '#00132f',
  950: '#00091c',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy,
        gold,
        brand: gold,
        cream: '#fae8cd',
      },
    },
  },
  plugins: [
    forms,
    typography,
  ],
}
