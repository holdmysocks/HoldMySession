// Writes src/styles/themes.css from the palettes. Run with `npm run themes` after changing a palette.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { themesCss } from '../src/features/theme/palettes.ts'

const target = fileURLToPath(new URL('../src/styles/themes.css', import.meta.url))
writeFileSync(target, themesCss())
console.log('Wrote', target)
