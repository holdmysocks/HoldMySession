// Small decisions about how the app was started, kept apart from Electron so they can be tested.

/** A start with --background (the Claude Code start hook, or sign-in) must never bring up a window. */
function isBackgroundLaunch(argv) {
  return argv.includes('--background');
}

/**
 * Whether another copy starting should make the running app show its window. Starting the program by hand
 * does, since that is how someone asks for the window. A background start does not: the start hook runs
 * for every new Claude Code session, and must not pull a minimised or hidden window up or take focus.
 */
function shouldShowWindowFor(argv) {
  return !isBackgroundLaunch(argv);
}

const net = require('node:net');

function connectsTo(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

/**
 * Whether something answers on this port on this computer. The app listens on "localhost", which can mean
 * the IPv6 address (::1) as well as the IPv4 one, so both are tried. Checking only 127.0.0.1 said "not running"
 * for an app that was, and the start hook then started a second copy, which made the first one show its window.
 */
async function portInUse(port, timeoutMs = 800, hosts = ['127.0.0.1', '::1']) {
  for (const host of hosts) {
    if (await connectsTo(host, port, timeoutMs)) return true;
  }
  return false;
}

module.exports = { isBackgroundLaunch, shouldShowWindowFor, portInUse };
