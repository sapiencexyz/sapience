/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "../ui/components/**/*.{js,ts,jsx,tsx}"
    ],
    presets: [require('@sapience/ui/tailwind-preset')],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Avenir Next Rounded', 'sans-serif'],
                heading: ['Avenir Next', 'sans-serif'],
                display: ['Avenir Next', 'sans-serif'], // Polymarket Parlays feature
                mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
            },
            colors: {
                'brand-black': 'hsl(var(--brand-black))',
                'brand-white': 'hsl(var(--brand-white))',
                'accent-gold': 'hsl(var(--accent-gold))',
                'brand-green': 'hsl(var(--brand-green))',
                'brand-red': 'hsl(var(--brand-red))',
                'yes': 'hsl(var(--brand-green))',
                'no': 'hsl(var(--brand-red))',
                // Polymarket Parlays feature — royal palette
                'royal-50': '#eef2ff',
                'royal-100': '#dbe4ff',
                'royal-200': '#bac8ff',
                'royal-300': '#91a7ff',
                'royal-400': '#748ffc',
                'royal-500': '#5c7cfa',
                'royal-600': '#4c6ef5',
                'royal-700': '#4263eb',
                'royal-800': '#3b5bdb',
                'royal-900': '#364fc7',
                'royal-950': '#1a2a6c',
            },
        }
    },
}

