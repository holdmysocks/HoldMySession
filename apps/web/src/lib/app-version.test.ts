import { describe, it, expect } from 'vitest'
import { readVersionFromPackageJson } from './app-version'

describe('readVersionFromPackageJson', () => {
  it('reads a version like 1.2.3 from package.json', () => {
    expect(readVersionFromPackageJson()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
