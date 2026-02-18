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
            },
        }
    },
}

