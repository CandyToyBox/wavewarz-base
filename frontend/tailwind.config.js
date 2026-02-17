/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // WaveWarz Brand Colors
        'deep-space': '#0d1321',
        'wave-blue': '#7ec1fb',
        'action-green': '#95fe7c',
        'ice-blue': '#daecfd',
        'ww-grey': '#989898',
      },
      fontFamily: {
        rajdhani: ['Rajdhani', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'cyber-flicker': 'cyber-flicker 0.15s infinite',
        'neon-glow': 'neon-glow 2s ease-in-out infinite',
        'chart-rise': 'chart-rise 0.6s ease-out',
        'lobster-bounce': 'lobster-bounce 0.6s ease-in-out infinite',
        'trading-pulse': 'trading-pulse 1s ease-in-out infinite',
        'matrix-rain': 'matrix-rain 20s linear infinite',
        'glow-flash': 'glow-flash 0.4s ease-in-out',
        'scale-in': 'scale-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(126, 193, 251, 0.5)' },
          '50%': { boxShadow: '0 0 20px rgba(126, 193, 251, 0.8)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'cyber-flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'neon-glow': {
          '0%, 100%': { textShadow: '0 0 10px rgba(149, 254, 124, 0.5), 0 0 20px rgba(126, 193, 251, 0.3)' },
          '50%': { textShadow: '0 0 20px rgba(149, 254, 124, 0.8), 0 0 40px rgba(126, 193, 251, 0.6)' },
        },
        'chart-rise': {
          '0%': { transform: 'scaleY(0)', transformOrigin: 'bottom' },
          '100%': { transform: 'scaleY(1)', transformOrigin: 'bottom' },
        },
        'lobster-bounce': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'trading-pulse': {
          '0%, 100%': { boxShadow: '0 0 0px rgba(149, 254, 124, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(149, 254, 124, 0.8)' },
        },
        'matrix-rain': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'glow-flash': {
          '0%': { boxShadow: '0 0 0px rgba(149, 254, 124, 0.8)' },
          '50%': { boxShadow: '0 0 30px rgba(149, 254, 124, 0.8)' },
          '100%': { boxShadow: '0 0 0px rgba(149, 254, 124, 0)' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
