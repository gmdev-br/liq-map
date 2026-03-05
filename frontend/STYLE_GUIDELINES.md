# Coinglass Style Guidelines

> **Version:** 1.0.0  
> **Last Updated:** March 2025  
> **Project:** Coinglass - Crypto Analytics Platform

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [CSS Custom Properties](#css-custom-properties)
7. [Tailwind Configuration](#tailwind-configuration)
8. [Accessibility](#accessibility)
9. [Best Practices](#best-practices)

---

## Design Philosophy

The Coinglass design system follows a **"Liquid Glass"** aesthetic - combining modern glass morphism effects with a dark-first crypto/fintech visual language.

### Core Principles

- **Dark-First Design**: Primary interface is dark (`hsl(220 25% 8%)`) with light mode as secondary
- **Glass Morphism**: Semi-transparent backgrounds with blur effects and subtle borders
- **Crypto Aesthetic**: Green for positive/UP, Red for negative/DOWN, Blue/Purple accents
- **Performance First**: Minimal animations, optimized shadows, reduced visual noise
- **High Contrast**: Text at 90%+ opacity on dark backgrounds for readability

---

## Color System

### Semantic Colors (HSL Variables)

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--background` | `0 0% 100%` | `220 25% 8%` | Page background |
| `--foreground` | `222.2 84% 4.9%` | `210 40% 98%` | Primary text |
| `--card` | `0 0% 100%` | `220 25% 10%` | Card backgrounds |
| `--card-foreground` | `222.2 84% 4.9%` | `210 40% 98%` | Card text |
| `--primary` | `217.2 91.2% 59.8%` | `217.2 91.2% 59.8%` | Primary actions |
| `--secondary` | `210 40% 96.1%` | `220 20% 16%` | Secondary elements |
| `--muted` | `210 40% 96.1%` | `220 20% 16%` | Muted backgrounds |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | Secondary text |
| `--accent` | `210 40% 96.1%` | `220 20% 18%` | Accent elements |
| `--destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` | Errors/destructive |
| `--border` | `214.3 31.8% 91.4%` | `220 20% 18%` | Borders |
| `--ring` | `217.2 91.2% 59.8%` | `217.2 91.2% 59.8%` | Focus rings |

### Functional Colors

```css
/* Status Colors */
--success: #22c55e;    /* Positive, UP, Buy */
--warning: #f59e0b;    /* Warning, Caution */
--danger: #ef4444;     /* Negative, DOWN, Sell, Error */
--info: #3b82f6;       /* Information, Neutral */

/* Crypto-Specific */
--crypto-green: #22c55e;  /* Price UP */
--crypto-red: #ef4444;    /* Price DOWN */

/* Liquid Theme Colors */
--liquid-blue: #3b82f6;
--liquid-purple: #a855f7;
--liquid-pink: #ec4899;
--liquid-cyan: #06b6d4;
--liquid-teal: #14b8a6;
```

### Glass Effect Colors

```css
/* Dark Mode (Default) */
--glass-bg: rgba(25, 30, 40, 0.95);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-highlight: rgba(255, 255, 255, 0.05);
--glass-shadow: rgba(0, 0, 0, 0.2);

/* Light Mode */
--glass-bg: rgba(255, 255, 255, 0.95);
--glass-border: rgba(0, 0, 0, 0.1);
--glass-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
```

---

## Typography

### Font Stack

```css
/* System font stack for performance */
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Type Scale

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| **Display** | `2rem` (32px) | 700 | 1.2 | Page titles |
| **H1** | `1.5rem` (24px) | 700 | 1.3 | Section headers |
| **H2** | `1.25rem` (20px) | 600 | 1.4 | Card titles |
| **H3** | `1rem` (16px) | 600 | 1.5 | Subsection titles |
| **Body** | `0.875rem` (14px) | 400 | 1.6 | Body text |
| **Small** | `0.75rem` (12px) | 400 | 1.5 | Captions, metadata |
| **Tiny** | `0.625rem` (10px) | 500 | 1.4 | Badges, labels |

### Text Colors

```css
/* Hierarchy on dark backgrounds */
.text-white           /* Primary: 100% opacity */
.text-white/90        /* Secondary: 90% opacity */
.text-white/60        /* Tertiary: 60% opacity */
.text-white/50        /* Muted: 50% opacity */
.text-white/40        /* Disabled: 40% opacity */

/* Status text */
.text-green-400       /* Positive values */
.text-red-400         /* Negative values */
.text-blue-400        /* Neutral/Info values */
```

### Text Gradient

```css
.text-gradient {
  background: linear-gradient(135deg, hsl(217, 91%, 70%) 0%, hsl(250, 85%, 75%) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | `0.25rem` (4px) | Tight gaps |
| `space-2` | `0.5rem` (8px) | Default small gap |
| `space-3` | `0.75rem` (12px) | Standard gap |
| `space-4` | `1rem` (16px) | Default padding |
| `space-5` | `1.25rem` (20px) | Card padding |
| `space-6` | `1.5rem` (24px) | Section gaps |
| `space-8` | `2rem` (32px) | Large sections |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `0.75rem` (12px) | Default radius |
| `rounded-sm` | `calc(var(--radius) - 4px)` | Small elements |
| `rounded-md` | `calc(var(--radius) - 2px)` | Buttons, inputs |
| `rounded-lg` | `var(--radius)` | Cards |
| `rounded-liquid` | `16px` | Liquid cards |
| `rounded-liquid-sm` | `10px` | Small liquid elements |
| `rounded-liquid-lg` | `20px` | Large liquid cards |
| `rounded-full` | `9999px` | Pills, avatars |

### Layout Guidelines

- **Max Content Width:** `1400px`
- **Sidebar Width:** `64px` (collapsed) / `256px` (expanded)
- **Header Height:** `56px`
- **Card Padding:** `20px` (5)
- **Grid Gap:** `16px` (4)
- **Section Gap:** `24px` (6)

---

## Components

### Card Variants

```tsx
// Default Card
<Card variant="default">
  // Standard bordered card
</Card>

// Glass Card (Default)
<Card variant="glass">
  // Glass morphism effect
</Card>

// Gradient Border
<Card variant="gradient">
  // Blue-tinted border glow
</Card>

// Glow Effect
<Card variant="glow">
  // Blue glow shadow
</Card>
```

#### Card CSS Classes

```css
/* Base glass card */
.glass-card {
  background: rgba(30, 35, 45, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
```

### Buttons

```tsx
// Primary Button (Glass)
<button className="glass-button">
  Primary Action
</button>

// Secondary Button
<button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white/80">
  Secondary
</button>

// Icon Button
<button className="h-9 w-9 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
  <Icon className="h-5 w-5" />
</button>
```

#### Button CSS Classes

```css
.glass-button {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.glass-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}

.glass-button:active {
  transform: translateY(0);
}
```

### Inputs

```tsx
// Text Input
<input 
  className="h-9 w-full glass-input px-3 text-sm text-white placeholder:text-white/40"
  placeholder="Enter value..."
/>

// Search Input
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
  <input 
    type="search"
    className="h-9 w-56 glass-input pl-9 pr-3 text-sm text-white placeholder:text-white/40"
    placeholder="Search..."
  />
</div>
```

#### Input CSS

```css
.glass-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  transition: border-color 0.15s ease;
}

.glass-input:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(59, 130, 246, 0.5);
  outline: none;
}
```

### Badges

```tsx
// Status Badges
<Badge variant="success">Active</Badge>
<Badge variant="danger">Error</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="info">Info</Badge>
```

#### Badge CSS Classes

```css
.glass-badge-green {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: rgb(74, 222, 128);
}

.glass-badge-red {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: rgb(248, 113, 113);
}

.glass-badge-blue {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: rgb(96, 165, 250);
}
```

### Stat Cards

```tsx
<StatCard 
  title="Total Volume"
  value="$1.2M"
  change="+12.5%"
  changeType="positive"
  icon={<DollarSign />}
/>
```

### Icon Containers

```tsx
// Standard icon wrapper
<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
  <Icon className="h-5 w-5" />
</div>

// With border
<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20 border border-green-500/20 text-green-400">
  <Icon className="h-5 w-5" />
</div>
```

---

## CSS Custom Properties

### Global Variables (index.css)

```css
:root {
  /* Theme - Light */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 217.2 91.2% 59.8%;
  --radius: 0.75rem;
  
  /* Glass Effect - Light */
  --glass-bg: rgba(255, 255, 255, 0.95);
  --glass-border: rgba(0, 0, 0, 0.1);
  --glass-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  --glass-blur: 8px;
}

.dark {
  /* Theme - Dark */
  --background: 220 25% 8%;
  --foreground: 210 40% 98%;
  --card: 220 25% 10%;
  --card-foreground: 210 40% 98%;
  --secondary: 220 20% 16%;
  --secondary-foreground: 210 40% 98%;
  --muted: 220 20% 16%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 220 20% 18%;
  --destructive: 0 62.8% 30.6%;
  --border: 220 20% 18%;
  --input: 220 20% 18%;
  
  /* Glass Effect - Dark */
  --glass-bg: rgba(25, 30, 40, 0.95);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
```

---

## Tailwind Configuration

### Extended Theme

```javascript
// tailwind.config.js
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        crypto: {
          green: '#22c55e',
          red: '#ef4444',
        },
        glass: {
          bg: 'rgba(25, 30, 40, 0.95)',
          border: 'rgba(255, 255, 255, 0.1)',
          highlight: 'rgba(255, 255, 255, 0.05)',
          shadow: 'rgba(0, 0, 0, 0.2)',
        },
        liquid: {
          blue: '#3b82f6',
          purple: '#a855f7',
          pink: '#ec4899',
          cyan: '#06b6d4',
          teal: '#14b8a6',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        liquid: '16px',
        'liquid-sm': '10px',
        'liquid-lg': '20px',
      },
      backdropBlur: {
        glass: '8px',
        xs: '2px',
      },
      boxShadow: {
        glass: '0 2px 8px rgba(0, 0, 0, 0.2)',
        'glass-sm': '0 2px 6px rgba(0, 0, 0, 0.15)',
        'glass-lg': '0 4px 16px rgba(0, 0, 0, 0.25)',
        glow: '0 0 12px rgba(59, 130, 246, 0.3)',
        'glow-purple': '0 0 12px rgba(168, 85, 247, 0.3)',
        'glow-green': '0 0 12px rgba(34, 197, 94, 0.3)',
        'glow-red': '0 0 12px rgba(239, 68, 68, 0.3)',
      },
      backgroundImage: {
        'liquid-gradient': 'linear-gradient(135deg, hsl(217, 91%, 60%) 0%, hsl(250, 85%, 65%) 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out forwards',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
};
```

---

## Accessibility

### Color Contrast

- **Primary text (`text-white`)**: 100% opacity on dark backgrounds - AAA compliant
- **Secondary text (`text-white/90`)**: 90% opacity - AA compliant
- **Muted text (`text-white/60`)**: 60% opacity - minimum for large text
- **Disabled text (`text-white/40`)**: 40% opacity - for disabled states only

### Focus States

```css
/* Visible focus rings */
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

/* Custom focus for inputs */
.glass-input:focus {
  border-color: rgba(59, 130, 246, 0.5);
  outline: none;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Screen Reader Support

```tsx
// Always include sr-only text for icon buttons
<button>
  <Menu className="h-5 w-5" />
  <span className="sr-only">Toggle Menu</span>
</button>

// Use aria-label where appropriate
<button aria-label="Close dialog">
  <X className="h-5 w-5" />
</button>
```

---

## Best Practices

### DO's

1. **Use semantic HTML**
   ```tsx
   <button> not <div onClick>
   <nav> for navigation
   <header> for page headers
   ```

2. **Use CSS variables for theming**
   ```tsx
   <div className="bg-[hsl(var(--card))]">
   ```

3. **Maintain consistent spacing**
   ```tsx
   // Use the spacing scale
   <div className="p-5 gap-4"> {/* not p-[20px] gap-[16px] */}
   ```

4. **Use the glass-card class for cards**
   ```tsx
   <div className="glass-card p-5">
   ```

5. **Prefer `clsx` for conditional classes**
   ```tsx
   import { clsx } from 'clsx';
   
   <div className={clsx(
     'glass-card',
     isActive && 'border-blue-500/30',
     className
   )}>
   ```

### DON'Ts

1. **Don't use arbitrary values excessively**
   ```tsx
   // ❌ Avoid
   <div className="p-[17px]">
   
   // ✅ Use
   <div className="p-4">
   ```

2. **Don't override colors directly**
   ```tsx
   // ❌ Avoid
   <div className="bg-gray-800">
   
   // ✅ Use
   <div className="bg-card">
   ```

3. **Don't forget dark mode support**
   ```tsx
   // ❌ Avoid
   <div className="bg-white text-black">
   
   // ✅ Use
   <div className="bg-card text-card-foreground">
   ```

4. **Don't over-animate**
   ```tsx
   // ❌ Avoid complex animations
   transition: all 0.5s cubic-bezier(...)
   
   // ✅ Keep it simple
   transition: transform 0.15s ease
   ```

### File Organization

```
frontend/src/
├── components/
│   ├── ui/              # Base UI components
│   │   ├── Card.tsx
│   │   ├── Button.tsx
│   │   └── Badge.tsx
│   ├── Header.tsx       # Layout components
│   ├── Sidebar.tsx
│   └── Layout.tsx
├── pages/               # Page components
├── styles/              # (if needed)
│   └── globals.css
├── index.css            # Global styles + CSS vars
└── tailwind.config.js   # Tailwind configuration
```

### Performance Tips

1. **Use `will-change` sparingly**
   ```css
   .animate-slide-up {
     will-change: transform, opacity;
   }
   ```

2. **Prefer `transform` over positional properties**
   ```css
   /* ✅ Better performance */
   transform: translateY(-1px);
   
   /* ❌ Triggers layout */
   margin-top: -1px;
   ```

3. **Use `memo` for expensive components**
   ```tsx
   import { memo } from 'react';
   
   export const ExpensiveComponent = memo(function ExpensiveComponent() {
     // ...
   });
   ```

---

## Component Examples

### Complete Card Example

```tsx
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Card';
import { TrendingUp, ArrowRight } from 'lucide-react';

function ExampleCard() {
  return (
    <Card variant="glass">
      <CardHeader 
        title="Liquidation Stats"
        description="Real-time liquidation data"
        action={<Badge variant="success">Live</Badge>}
      />
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-white/60">Total Volume</p>
            <p className="text-2xl font-bold text-white">$1.2M</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-white/60">24h Change</p>
            <p className="text-2xl font-bold text-green-400">+12.5%</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <button className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
          View Details <ArrowRight className="h-4 w-4" />
        </button>
      </CardFooter>
    </Card>
  );
}
```

### Complete Form Example

```tsx
function ExampleForm() {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">
          Amount
        </label>
        <input 
          type="number"
          className="h-10 w-full glass-input px-3 text-white"
          placeholder="0.00"
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">
          Symbol
        </label>
        <select className="h-10 w-full glass-input px-3 text-white bg-transparent">
          <option value="BTC">BTC</option>
          <option value="ETH">ETH</option>
        </select>
      </div>
      
      <div className="flex gap-3 pt-2">
        <button className="flex-1 glass-button py-2 text-white font-medium">
          Submit
        </button>
        <button className="flex-1 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

---

## Resources

- **Tailwind CSS:** https://tailwindcss.com/docs
- **Lucide Icons:** https://lucide.dev/icons/
- **clsx:** https://github.com/lukeed/clsx

---

## Changelog

### v1.0.0 (March 2025)

- Initial style guidelines documentation
- Documented glass morphism design system
- Added component patterns and examples
- Included accessibility guidelines
- Defined color system and typography scale

---

*End of Style Guidelines*
