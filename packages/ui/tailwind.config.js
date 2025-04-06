/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    presets: [require('./tailwind-preset')],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Avenir Next', 'sans-serif'],
            },
        }
    },
}
