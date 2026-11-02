import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as os from 'node:os'
import * as path from 'node:path'
// @ts-expect-error -- plain JavaScript, with no types
import { authorityOf } from '../../bin/server.mjs'

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/server.mjs')

describe('authorityOf', () => {
  it.each([
    ['localhost:3000', 'localhost:3000'],
    ['192.168.1.5:3000', '192.168.1.5:3000'],
    ['my-laptop.tail1234.ts.net:3000', 'my-laptop.tail1234.ts.net:3000'],
    ['laptop', 'laptop'],
    ['[::1]:3000', '[::1]:3000'],
  ])('uses the address the browser used: %s', (header, expected) => expect(authorityOf(header, 'localhost', 3000)).toBe(expected))

  it.each([undefined, '', 'a b', 'evil.com/path', 'evil.com@host', 'host:99999999', 'ho st:3000', '<script>'])(
    'falls back to the listening address for a Host that is not a plain host and port: %j',
    (header) => expect(authorityOf(header, 'localhost', 3000)).toBe('localhost:3000'),
  )
})

describe('the server', () => {
  let dist: string
  let child: ChildProcess
  let port: number

  beforeEach(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-'))
    fs.mkdirSync(path.join(dist, 'client'), { recursive: true })
    fs.mkdirSync(path.join(dist, 'server'), { recursive: true })
    // A stand-in for the built app that says which address it was asked at.
    fs.writeFileSync(path.join(dist, 'server', 'server.js'), 'export default { fetch: (request) => new Response(new URL(request.url).origin) }')
    // The real server, in a plain Node process: a copy of the page is asked for at whatever address the test names.
    const runner = path.join(dist, 'run.mjs')
    fs.writeFileSync(
      runner,
      `import { createAppServer } from ${JSON.stringify(pathToFileURL(SERVER).href)};
       const server = await createAppServer({ distDir: ${JSON.stringify(dist)}, host: 'localhost', port: 3000 });
       server.listen(0, '127.0.0.1', () => console.log('PORT ' + server.address().port));`,
    )
    child = spawn(process.execPath, [runner], { stdio: ['ignore', 'pipe', 'inherit'] })
    port = await new Promise<number>((resolve, reject) => {
      child.stdout!.on('data', (d: Buffer) => {
        const m = /PORT (\d+)/.exec(d.toString())
        if (m) resolve(Number(m[1]))
      })
      child.on('exit', () => reject(new Error('the server did not start')))
    })
  })
  afterEach(() => {
    child.kill()
    fs.rmSync(dist, { recursive: true, force: true })
  })

  const ask = (host: string) =>
    new Promise<string>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/x', headers: { Host: host } }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve(body))
      }).on('error', reject)
    })

  it('gives the app the address the browser used, so a page at a LAN address matches its own requests', async () => {
    expect(await ask('192.168.1.5:3000')).toBe('http://192.168.1.5:3000')
    expect(await ask('laptop.tail1234.ts.net:3000')).toBe('http://laptop.tail1234.ts.net:3000')
    expect(await ask('localhost:3000')).toBe('http://localhost:3000')
  })

  it('falls back to the listening address for a Host that is not a plain address', async () => {
    expect(await ask('evil.com/path')).toBe('http://localhost:3000')
  })
})
