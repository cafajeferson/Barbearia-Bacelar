import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    // Antes só cobria pages/components/app — features/ e shared/ (onde mora
    // a maior parte da UI do sistema) ficavam de fora do scanner, então
    // qualquer classe usada só ali (ex.: w-56 no calendar-board) nunca era
    // gerada no CSS final, mesmo com a classe certa no JSX.
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		// Cores com '/ <alpha-value>' aceitam opacidade (bg-primary/10 etc.); sem isso o Tailwind
  		// não gerava nenhuma classe com '/NN'. --border, --input e --sidebar-border já trazem
  		// a própria transparência no CSS e ficam sem o modificador.
  		colors: {
  			background: 'oklch(var(--background) / <alpha-value>)',
  			foreground: 'oklch(var(--foreground) / <alpha-value>)',
  			card: {
  				DEFAULT: 'oklch(var(--card) / <alpha-value>)',
  				foreground: 'oklch(var(--card-foreground) / <alpha-value>)'
  			},
  			popover: {
  				DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
  				foreground: 'oklch(var(--popover-foreground) / <alpha-value>)'
  			},
  			primary: {
  				DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
  				foreground: 'oklch(var(--primary-foreground) / <alpha-value>)'
  			},
  			secondary: {
  				DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
  				foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)'
  			},
  			muted: {
  				DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
  				foreground: 'oklch(var(--muted-foreground) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
  				foreground: 'oklch(var(--accent-foreground) / <alpha-value>)'
  			},
  			destructive: 'oklch(var(--destructive) / <alpha-value>)',
  			border: 'oklch(var(--border))',
  			input: 'oklch(var(--input))',
  			ring: 'oklch(var(--ring) / <alpha-value>)',
  			success: {
  				DEFAULT: 'oklch(var(--success) / <alpha-value>)',
  				foreground: 'oklch(var(--success-foreground) / <alpha-value>)'
  			},
  			warning: {
  				DEFAULT: 'oklch(var(--warning) / <alpha-value>)',
  				foreground: 'oklch(var(--warning-foreground) / <alpha-value>)'
  			},
  			chart: {
  				'1': 'oklch(var(--chart-1) / <alpha-value>)',
  				'2': 'oklch(var(--chart-2) / <alpha-value>)',
  				'3': 'oklch(var(--chart-3) / <alpha-value>)',
  				'4': 'oklch(var(--chart-4) / <alpha-value>)',
  				'5': 'oklch(var(--chart-5) / <alpha-value>)'
  			},
  			sidebar: {
  				DEFAULT: 'oklch(var(--sidebar) / <alpha-value>)',
  				foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
  				primary: 'oklch(var(--sidebar-primary) / <alpha-value>)',
  				'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
  				accent: 'oklch(var(--sidebar-accent) / <alpha-value>)',
  				'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
  				border: 'oklch(var(--sidebar-border))',
  				ring: 'oklch(var(--sidebar-ring) / <alpha-value>)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: ['var(--font-sans)', 'system-ui', 'sans-serif']
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
