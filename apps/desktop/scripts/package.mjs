// Builds the desktop app on this machine, with no CI. Usage:
//   node scripts/package.mjs win32 x64          Windows zip
//   node scripts/package.mjs darwin arm64 x64   Mac zips (one per architecture)
//   node scripts/package.mjs win32 x64 --build  run `npm run build` in apps/web first
//
// It stages the built web app with only its production dependencies, packages it with Electron for each
// platform and architecture asked for, puts the icon on the Windows program, and writes release/*.zip and
// release/SHA256SUMS.txt. It can build for Mac from Windows or Linux. A Mac build is signed ad hoc when `rcodesign`
// (apple-codesign, set RCODESIGN to its path if it is not on PATH) is there, which Apple Silicon needs to run it at all,
// and also written as a disk image when `xorriso` is there, compressed into a real .dmg when libdmg-hfsplus's `dmg`
// is too (DMG_TOOL is its path if it is not on PATH). Neither signing is a developer signature, so macOS still asks once.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import * as ResEdit from 'resedit';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const web = join(desktop, '..', 'web');
const stage = join(desktop, '.stage', 'app');
const outDir = join(desktop, '.stage', 'out');
const releaseDir = join(desktop, 'release');
const NAME = 'HoldMySession';

/** Whether a program runs, so a Mac build can use `rcodesign` and `xorriso` when they are there and say so when they are not. */
function available(program, args = ['--version']) {
  try {
    execFileSync(program, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Whether a program is there to run, whatever it does with the arguments: `dmg` prints its usage and exits non-zero. */
function installed(program) {
  return spawnSync(program, [], { stdio: 'ignore' }).error?.code !== 'ENOENT';
}

const argv = process.argv.slice(2);
const doBuild = argv.includes('--build');
const wanted = argv.filter((a) => !a.startsWith('--'));
const platform = wanted[0];
const arches = wanted.slice(1);
if (!['win32', 'darwin', 'linux'].includes(platform) || arches.length === 0) {
  console.error('Usage: node scripts/package.mjs <win32|darwin|linux> <x64|arm64>... [--build]');
  process.exit(1);
}

const webPackage = JSON.parse(readFileSync(join(web, 'package.json'), 'utf-8'));
const desktopPackage = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf-8'));
const version = webPackage.version;
const electronVersion = desktopPackage.devDependencies.electron;

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

// --- The built web app ---

if (doBuild) run('npm', ['run', 'build'], web);
if (!existsSync(join(web, 'dist', 'server', 'server.js'))) {
  console.error('apps/web is not built. Run `npm run build` there, or pass --build.');
  process.exit(1);
}

// --- Stage: this folder is what Electron packages ---

console.log(`\n==> Staging ${NAME} ${version}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'web'), { recursive: true });
cpSync(join(desktop, 'main.cjs'), join(stage, 'main.cjs'));
cpSync(join(desktop, 'updater.cjs'), join(stage, 'updater.cjs'));
cpSync(join(desktop, 'launch.cjs'), join(stage, 'launch.cjs'));
cpSync(join(desktop, 'swap.cjs'), join(stage, 'swap.cjs'));
cpSync(join(desktop, 'alerts.cjs'), join(stage, 'alerts.cjs'));
cpSync(join(desktop, 'idle.cjs'), join(stage, 'idle.cjs'));
mkdirSync(join(stage, 'icons'));
for (const f of ['icon.png', 'tray.png', 'tray@2x.png', 'tray-alert.png', 'tray-alert@2x.png']) cpSync(join(desktop, 'icons', f), join(stage, 'icons', f));
for (const f of ['dist', 'bin', 'package.json', 'package-lock.json']) cpSync(join(web, f), join(stage, 'web', f), { recursive: true });
// The program's own package file: its main is the desktop main, and its version is the app's version.
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify({ name: 'holdmysession', productName: NAME, version, description: webPackage.description, main: 'main.cjs', license: 'MIT' }, null, 2),
);
console.log('==> Installing the production dependencies');
run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], join(stage, 'web'));

// Build tools that npm installs as dependencies of the framework but the running server never loads. Dropping them
// keeps the download smaller, and removes the Linux-only copies of esbuild and lightningcss that `npm ci` fetched here.
const BUILD_ONLY = ['esbuild', '@esbuild', 'lightningcss', 'lightningcss-linux-x64-gnu', 'lightningcss-linux-x64-musl', 'lightningcss-darwin-arm64',
  'lightningcss-darwin-x64', 'lightningcss-win32-x64-msvc', 'rollup', '@rollup', 'vite', '@babel', 'prettier', 'caniuse-lite', 'jiti', '@types'];
for (const name of BUILD_ONLY) rmSync(join(stage, 'web', 'node_modules', name), { recursive: true, force: true });

// --- Package, one platform and architecture at a time ---

function windowsIcon(exePath) {
  // electron-packager sets the icon with a Windows program, so on other systems it is done here instead.
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath));
  const resources = ResEdit.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(readFileSync(join(desktop, 'icons', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const group = groups[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    group ? group.id : 1,
    group ? group.lang : 1033,
    icon.icons.map((i) => i.data),
  );
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (versions[0]) {
    const info = versions[0];
    const lang = { lang: 1033, codepage: 1200 };
    info.setStringValues(lang, {
      CompanyName: NAME,
      ProductName: NAME,
      FileDescription: NAME,
      InternalName: NAME,
      OriginalFilename: `${NAME}.exe`,
      ProductVersion: version,
      FileVersion: version,
    });
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
}

mkdirSync(releaseDir, { recursive: true });
const sums = [];

for (const arch of arches) {
  console.log(`\n==> Packaging ${platform} ${arch} with Electron ${electronVersion}`);
  const [built] = await packager({
    dir: stage,
    out: outDir,
    name: NAME,
    platform,
    arch,
    electronVersion,
    overwrite: true,
    // One archive instead of ~19,000 files: much faster to unzip, scan and update. Nothing in it needs to be a real file.
    asar: true,
    prune: false,
    quiet: true,
    appBundleId: 'com.holdmysocks.holdmysession',
    appCategoryType: 'public.app-category.developer-tools',
    appCopyright: 'MIT License',
    ...(platform === 'darwin' ? { icon: join(desktop, 'icons', 'icon.icns') } : {}),
  });

  if (platform === 'win32') windowsIcon(join(built, `${NAME}.exe`));

  // Apple Silicon kills a program whose signature does not match its files, and packaging changes the files. An ad hoc
  // signature, made here, is enough for it to run. It is not a developer signature, so macOS still asks once.
  let signed = false;
  if (platform === 'darwin') {
    const rcodesign = process.env.RCODESIGN || 'rcodesign';
    if (available(rcodesign)) {
      execFileSync(rcodesign, ['sign', join(built, `${NAME}.app`)], { stdio: 'ignore' });
      signed = true;
      console.log('==> Signed ad hoc');
    } else {
      console.warn(`==> NOT SIGNED: rcodesign was not found. On a Mac, run: codesign --force --deep --sign - ${NAME}.app`);
    }
  }

  writeFileSync(
    join(built, 'README.txt'),
    platform === 'win32'
      ? `${NAME} ${version}\n\nRun ${NAME}.exe. It opens a window and keeps running in the tray, near the clock, when you close it.\nThe same app is at http://localhost:3000 in a browser.\n\nWindows may warn that the program is from an unknown publisher, because it is not signed. Choose More info, then Run anyway.\nYour data is kept in ${'%USERPROFILE%'}\\.holdmysession. Delete this folder to uninstall.\n`
      : `${NAME} ${version}\n\nOpen ${NAME}. It opens a window and keeps running in the menu bar when you close it.\nThe same app is at http://localhost:3000 in a browser.\n\nmacOS will not open an app downloaded from the internet that is not notarized, and this one is not. Once, after copying it to Applications, run:\n  xattr -dr com.apple.quarantine /Applications/${NAME}.app\nor open System Settings, Privacy and Security, and choose Open Anyway.${signed ? '' : `\nIt is also not signed. Run: codesign --force --deep --sign - ${NAME}.app`}\nYour data is kept in ~/.holdmysession. Drag the app to the Bin to uninstall.\n`,
  );

  const label = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  const zip = join(releaseDir, `${NAME}-${version}-${label}-${arch}.zip`);
  rmSync(zip, { force: true });
  // -y keeps symbolic links, which a Mac app's frameworks depend on.
  execFileSync('zip', ['-r', '-y', '-q', zip, '.'], { cwd: built, stdio: 'inherit' });
  sums.push(`${createHash('sha256').update(readFileSync(zip)).digest('hex')}  ${zip.split(/[\\/]/).pop()}`);
  console.log(`==> ${zip}`);

  // A disk image to open and drag the app from, with a shortcut to Applications beside it.
  if (platform === 'darwin') {
    if (available('xorriso', ['-version'])) {
      const dmg = join(releaseDir, `${NAME}-${version}-mac-${arch}.dmg`);
      const folder = join(desktop, '.stage', 'dmg');
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(folder, { recursive: true });
      cpSync(join(built, `${NAME}.app`), join(folder, `${NAME}.app`), { recursive: true, verbatimSymlinks: true });
      symlinkSync('/Applications', join(folder, 'Applications'));
      rmSync(dmg, { force: true });
      const iso = join(desktop, '.stage', 'dmg.iso');
      rmSync(iso, { force: true });
      execFileSync('xorriso', ['-as', 'mkisofs', '-V', `${NAME} ${version}`, '-D', '-l', '-r', '-no-pad', '-dir-mode', '0755', '-o', iso, folder], { stdio: 'ignore' });
      const dmgTool = process.env.DMG_TOOL || 'dmg';
      if (installed(dmgTool)) {
        // The standard way to make a disk image without a Mac: an ISO of the files, compressed into Apple's own format.
        execFileSync(dmgTool, [iso, dmg], { stdio: 'ignore' });
        rmSync(iso, { force: true });
      } else {
        console.warn('==> The disk image is an uncompressed CD image: dmg (libdmg-hfsplus) was not found.');
        cpSync(iso, dmg);
        rmSync(iso, { force: true });
      }
      rmSync(folder, { recursive: true, force: true });
      sums.push(`${createHash('sha256').update(readFileSync(dmg)).digest('hex')}  ${dmg.split(/[\\/]/).pop()}`);
      console.log(`==> ${dmg}`);
    } else {
      console.warn('==> No disk image: xorriso was not found.');
    }
  }
}

const sumFile = join(releaseDir, 'SHA256SUMS.txt');
const previous = existsSync(sumFile)
  ? readFileSync(sumFile, 'utf-8').split('\n').filter((l) => l && !sums.some((s) => s.endsWith(l.slice(66))))
  : [];
writeFileSync(sumFile, [...previous, ...sums].join('\n') + '\n');
console.log(`\nDone. Files are in ${releaseDir}`);
