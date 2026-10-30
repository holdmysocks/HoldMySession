import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { readProjectLayout, writeProjectLayout } from './layout-store'

describe('layout store', () => {
  let home: string
  const file = () => path.join(home, '.claude-dashboard', 'map-layouts.json')

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-store-'))
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('is empty when nothing was saved', async () => {
    expect(await readProjectLayout('app', home)).toEqual({})
  })

  it('saves and reads back a project layout, creating the folder', async () => {
    await writeProjectLayout('app', { 'session:a': { x: 10, y: 20 } }, home)
    expect(await readProjectLayout('app', home)).toEqual({ 'session:a': { x: 10, y: 20 } })
    expect(fs.existsSync(`${file()}.tmp`)).toBe(false)
  })

  it('keeps other projects when one is saved, and replaces a project rather than merging', async () => {
    await writeProjectLayout('one', { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, home)
    await writeProjectLayout('two', { c: { x: 3, y: 3 } }, home)
    await writeProjectLayout('one', { a: { x: 9, y: 9 } }, home)
    expect(await readProjectLayout('one', home)).toEqual({ a: { x: 9, y: 9 } })
    expect(await readProjectLayout('two', home)).toEqual({ c: { x: 3, y: 3 } })
  })

  it('removes a project when it is saved empty', async () => {
    await writeProjectLayout('one', { a: { x: 1, y: 1 } }, home)
    await writeProjectLayout('one', {}, home)
    expect(await readProjectLayout('one', home)).toEqual({})
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8')).projects).toEqual({})
  })

  it('does not lose a save when several are made at once', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => writeProjectLayout(`p${i}`, { n: { x: i, y: i } }, home)),
    )
    for (let i = 0; i < 10; i++) {
      expect(await readProjectLayout(`p${i}`, home)).toEqual({ n: { x: i, y: i } })
    }
  })

  it('treats an invalid file as empty and replaces it on the next save', async () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), '{not json')
    expect(await readProjectLayout('app', home)).toEqual({})
    await writeProjectLayout('app', { a: { x: 1, y: 2 } }, home)
    expect(await readProjectLayout('app', home)).toEqual({ a: { x: 1, y: 2 } })
  })

  it('does not read an inherited property as a project', async () => {
    expect(await readProjectLayout('toString', home)).toEqual({})
  })
})
