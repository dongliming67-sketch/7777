/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#FAF9F6', // Warm beige background
          sidebar: '#F3F2F0', // Slightly darker for sidebar
          card: '#FFFFFF', // White for cards
          text: {
            primary: '#1A1A1A', // Nearly black
            secondary: '#52525B', // Dark gray
            muted: '#71717A', // Muted gray
          },
          accent: {
            primary: '#D97706', // Warm orange/terracotta
            hover: '#B45309',
            light: '#FFFBEB',
          },
          border: '#E4E4E7', // Light gray border
          divider: '#F4F4F5',
        },
        primary: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B', // Shift primary to warm amber/orange
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Söhne', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Tiempos', 'Merriweather', 'Georgia', 'ui-serif', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'claude': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'claude-lg': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
      }
    },
  },
  plugins: [],
}
