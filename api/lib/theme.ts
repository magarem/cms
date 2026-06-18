export interface ThemeColors {
  "--color-primary": string
  "--color-secondary": string
  "--color-accent": string
  "--color-bg-base": string
  "--color-bg-muted": string
  "--color-text-main": string
  "--color-text-muted": string
  "--color-border": string
  "--font-sans"?: string
  "--font-serif"?: string
  "--radius-botao"?: string
  "--radius-cartao"?: string
  "--max-width-site"?: string
  "--max-width-content"?: string
  "--max-width-copy"?: string
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  adaptiveMode: boolean
  defaultColorMode?: "light" | "dark" | "system"
  light: ThemeColors
  dark?: Partial<ThemeColors>
}

export const BUILT_IN_PRESETS: ThemePreset[] = [
  {
    id: "basic",
    name: "Basic",
    description: "Neutro com modo claro/escuro",
    adaptiveMode: true,
    defaultColorMode: "system",
    light: {
      "--color-primary":     "#230b9d",
      "--color-secondary":   "#0f172a",
      "--color-accent":      "#f59e0b",
      "--color-bg-base":     "#ffffff",
      "--color-bg-muted":    "#f8fafc",
      "--color-text-main":   "#1e293b",
      "--color-text-muted":  "#64748b",
      "--color-border":      "#e2e8f0",
      "--font-sans":         "'Inter', system-ui, sans-serif",
      "--font-serif":        "'Merriweather', serif",
      "--radius-botao":      "12px",
      "--radius-cartao":     "24px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
    dark: {
      "--color-primary":    "#3b82f6",
      "--color-bg-base":    "#0f172a",
      "--color-bg-muted":   "#1e293b",
      "--color-text-main":  "#f8fafc",
      "--color-text-muted": "#94a3b8",
      "--color-border":     "#334155",
    },
  },
  {
    id: "natura",
    name: "Natura",
    description: "Tons verdes e terrosos",
    adaptiveMode: false,
    light: {
      "--color-primary":     "#16a34a",
      "--color-secondary":   "#854d0e",
      "--color-accent":      "#84cc16",
      "--color-bg-base":     "#fefce8",
      "--color-bg-muted":    "#f0fdf4",
      "--color-text-main":   "#14532d",
      "--color-text-muted":  "#4d7c0f",
      "--color-border":      "#bbf7d0",
      "--font-sans":         "'Lato', system-ui, sans-serif",
      "--font-serif":        "'Merriweather', serif",
      "--radius-botao":      "8px",
      "--radius-cartao":     "16px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
  },
  {
    id: "sol",
    name: "Sol",
    description: "Quente e dourado",
    adaptiveMode: false,
    light: {
      "--color-primary":     "#d97706",
      "--color-secondary":   "#92400e",
      "--color-accent":      "#ef4444",
      "--color-bg-base":     "#fffbeb",
      "--color-bg-muted":    "#fef3c7",
      "--color-text-main":   "#78350f",
      "--color-text-muted":  "#92400e",
      "--color-border":      "#fde68a",
      "--font-sans":         "'Source Sans Pro', system-ui, sans-serif",
      "--font-serif":        "'Playfair Display', serif",
      "--radius-botao":      "20px",
      "--radius-cartao":     "32px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
  },
  {
    id: "oceano",
    name: "Oceano",
    description: "Azuis serenos e profundos",
    adaptiveMode: false,
    light: {
      "--color-primary":     "#0369a1",
      "--color-secondary":   "#0e7490",
      "--color-accent":      "#7c3aed",
      "--color-bg-base":     "#f0f9ff",
      "--color-bg-muted":    "#e0f2fe",
      "--color-text-main":   "#0c4a6e",
      "--color-text-muted":  "#0369a1",
      "--color-border":      "#bae6fd",
      "--font-sans":         "'Open Sans', system-ui, sans-serif",
      "--font-serif":        "'Montserrat', serif",
      "--radius-botao":      "12px",
      "--radius-cartao":     "20px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
  },
  {
    id: "noite",
    name: "Noite",
    description: "Escuro e elegante",
    adaptiveMode: false,
    light: {
      "--color-primary":     "#a78bfa",
      "--color-secondary":   "#818cf8",
      "--color-accent":      "#f472b6",
      "--color-bg-base":     "#09090b",
      "--color-bg-muted":    "#18181b",
      "--color-text-main":   "#fafafa",
      "--color-text-muted":  "#a1a1aa",
      "--color-border":      "#27272a",
      "--font-sans":         "'Inter', system-ui, sans-serif",
      "--font-serif":        "'Merriweather', serif",
      "--radius-botao":      "12px",
      "--radius-cartao":     "24px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
  },
  {
    id: "arraial",
    name: "Arraial d'Ajuda",
    description: "Tropical e sofisticado — pousadas e hotéis boutique",
    adaptiveMode: false,
    light: {
      "--color-primary":     "#0B3D5C",
      "--color-secondary":   "#2BA6A6",
      "--color-accent":      "#D8A24A",
      "--color-bg-base":     "#FFFFFF",
      "--color-bg-muted":    "#F4E9D8",
      "--color-text-main":   "#0B3D5C",
      "--color-text-muted":  "#2BA6A6",
      "--color-border":      "#E8D5BF",
      "--font-sans":         "'Lato', system-ui, sans-serif",
      "--font-serif":        "'Playfair Display', serif",
      "--radius-botao":      "8px",
      "--radius-cartao":     "16px",
      "--max-width-site":    "1440px",
      "--max-width-content": "1200px",
      "--max-width-copy":    "800px",
    },
  },
]
