import { defineConfig, presetUno, presetWind ,presetAttributify, presetIcons } from 'unocss'

function hexToRgba(hex, alpha) {
  if (!hex) return ''
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const brandColors = { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#6C8AFF', 500: '#4A6CFF', 600: '#3A5CED' }
const agentColors = { 50: '#f5f3ff', 100: '#ede9fe', 400: '#A78BFA', 500: '#7C3AED' }
const outputColors = { 50: '#ecfdf5', 100: '#d1fae5', 400: '#34D399', 500: '#10B981' }
const violetColors = { 300: '#C4B5FD', 400: '#8B5CF6', 50: '#f5f3ff' }
const skyColors = { 400: '#38BDF8', 50: '#f0f9ff' }
const pinkColors = { 400: '#F472B6', 50: '#fdf2f8' }
const emeraldColors = { 400: '#34D399', 600: '#059669', 50: '#ecfdf5', 100: '#d1fae5' }
const amberColors = { 400: '#FACC15', 500: '#F59E0B', 600: '#D97706', 50: '#fffbeb', 100: '#fef3c7' }
const roseColors = { 400: '#FB7185', 50: '#fff1f2' }
const redColors = { 400: '#F87171', 50: '#fef2f2' }
const dColors = { 0: '#0e0e12', 1: '#171720', 2: '#1c1c26', 3: '#252530', 4: '#2e2e3a' }
const lColors = { 0: '#f8f7f6', 1: '#f1f0ef', 2: '#ffffff', 3: '#f5f4f3', 4: '#ebeae8' }
const wtColors = { main: '#e8e8ed', sub: '#b0b0ba', aux: '#78788a', dim: '#555568' }

export default defineConfig({
  preflights: [
    {
      layer: 'components',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
  presets: [
    presetUno(),
    presetAttributify(),
    presetWind(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
    }),
  ],

  theme: {
    colors: {
      d0: '#0e0e12', d1: '#171720', d2: '#1c1c26', d3: '#252530', d4: '#2e2e3a',
      l0: '#f8f7f6', l1: '#f1f0ef', l2: '#ffffff', l3: '#f5f4f3', l4: '#ebeae8',
      brand: brandColors,
      agent: agentColors,
      output: outputColors,
      wt: wtColors,
      lt: { main: '#1a1a2e', sub: '#5a5a6e', aux: '#8a8a9e' },
      bdr: '#353542', bdrL: '#dddcd9', bdrF: '#e2e1de',
    },
    breakpoints: {
      xs: '640px',
      '3xl': '1600px',
    },
  },
  safelist: [
    'bg-d0', 'bg-d1', 'bg-d2', 'bg-d3', 'bg-d4',
    'bg-l0', 'bg-l1', 'bg-l2', 'bg-l3', 'bg-l4',
    'text-wt-main', 'text-wt-sub', 'text-wt-aux', 'text-wt-dim',
    'text-lt-main', 'text-lt-sub', 'text-lt-aux',
    'border-bdr', 'border-bdrL', 'border-bdrF', 'border-d4',
	    'border-solid', 'border-r', 'border-r-2', 'border-t', 'border-b', 'border-l',
    'bg-brand-50', 'bg-brand-400', 'bg-brand-500', 'bg-brand-600',
    'text-brand-400', 'text-brand-500', 'border-brand-400',
    'bg-agent-50', 'bg-agent-400', 'bg-agent-500',
    'text-agent-400', 'text-agent-500',
    'bg-output-50', 'bg-output-400', 'bg-output-500',
    'text-output-400', 'text-output-500',
    'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-red-400',
    'text-emerald-400', 'text-amber-400', 'text-rose-400',
    'bg-red-400/8', 'bg-amber-400/8', 'bg-brand-400/8', 'bg-emerald-400/8',
    'bg-red-50', 'bg-amber-50', 'bg-brand-50',
    'text-red-500', 'bg-red-500', 'bg-amber-500', 'hover:bg-red-600', 'hover:bg-amber-600',
    'bg-brand-400/12', 'hover:bg-white/2',
    'bg-white', 'text-white',
  ],
  rules: [
    // brand opacity variants
    [/^bg-brand-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(brandColors[s], +o / 100) })],
    [/^text-brand-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'color': hexToRgba(brandColors[s], +o / 100) })],
    [/^border-brand-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(brandColors[s], +o / 100) })],
    // agent opacity variants
    [/^bg-agent-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(agentColors[s], +o / 100) })],
    [/^text-agent-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'color': hexToRgba(agentColors[s], +o / 100) })],
    [/^border-agent-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(agentColors[s], +o / 100) })],
    // output opacity variants
    [/^bg-output-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(outputColors[s], +o / 100) })],
    // dark layer opacity
    [/^bg-d([0-4])\/(\d+)$/, ([, l, o]) => ({ 'background-color': hexToRgba(dColors[l], +o / 100) })],
    // light layer opacity
    [/^bg-l([0-4])\/(\d+)$/, ([, l, o]) => ({ 'background-color': hexToRgba(lColors[l], +o / 100) })],
    // white opacity
    [/^bg-white\/(\d+)$/, ([, o]) => ({ 'background-color': `rgba(255,255,255,${+o / 100})` })],
    [/^text-white\/(\d+)$/, ([, o]) => ({ 'color': `rgba(255,255,255,${+o / 100})` })],
    // warm text opacity
    [/^text-wt-(main|sub|aux|dim)\/(\d+)$/, ([, k, o]) => ({ 'color': hexToRgba(wtColors[k], +o / 100) })],
    // border opacity
    [/^border-bdr\/(\d+)$/, ([, o]) => ({ 'border-color': hexToRgba('#353542', +o / 100) })],
    // emerald opacity variants
    [/^bg-emerald-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(emeraldColors[s], +o / 100) })],
    [/^text-emerald-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'color': hexToRgba(emeraldColors[s], +o / 100) })],
    [/^border-emerald-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(emeraldColors[s], +o / 100) })],
    // amber opacity variants
    [/^bg-amber-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(amberColors[s], +o / 100) })],
    [/^text-amber-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'color': hexToRgba(amberColors[s], +o / 100) })],
    [/^border-amber-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(amberColors[s], +o / 100) })],
    // rose opacity variants
    [/^bg-rose-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(roseColors[s], +o / 100) })],
    [/^border-rose-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(roseColors[s], +o / 100) })],
    // red opacity variants
    [/^bg-red-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(redColors[s], +o / 100) })],
    [/^border-red-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(redColors[s], +o / 100) })],
    // violet opacity variants
    [/^bg-violet-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(violetColors[s], +o / 100) })],
    [/^text-violet-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'color': hexToRgba(violetColors[s], +o / 100) })],
    [/^border-violet-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(violetColors[s], +o / 100) })],
    // sky opacity variants
    [/^bg-sky-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(skyColors[s], +o / 100) })],
    [/^border-sky-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(skyColors[s], +o / 100) })],
    // pink opacity variants
    [/^bg-pink-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'background-color': hexToRgba(pinkColors[s], +o / 100) })],
    [/^border-pink-(\d+)\/(\d+)$/, ([, s, o]) => ({ 'border-color': hexToRgba(pinkColors[s], +o / 100) })],
    // brand-400/12 special for active nav
    [/^bg-brand-400\/12$/, () => ({ 'background-color': hexToRgba(brandColors[400], 0.12) })],
  ],
})
