'use strict';
/**
 * electron-builder afterPack hook — macOS code signing.
 *
 * electron-builder only linker-signs the app, which leaves bundles that fail
 * `codesign --verify --deep` and get SIGKILLed by macOS at launch.
 *
 * Signing with `--deep` is NOT a fix: it stamps the main executable and the
 * embedded helpers with different Team IDs, and dyld then refuses to load the
 * framework:
 *
 *   dyld: Library not loaded: @rpath/Electron Framework.framework/Electron Framework
 *   Reason: ... mapping process and mapped file (non-platform) have different Team IDs
 *
 * The correct approach is to sign every nested binary bottom-up with the SAME
 * identity, then sign the outer bundle once:
 *
 *   1. each helper .app  (inside Contents/Frameworks)
 *   2. each dylib / framework binary
 *   3. the top-level executable
 *   4. the .app bundle itself
 *
 * Set APPLE_SIGNING_IDENTITY to a "Developer ID Application: ..." identity for
 * distributable builds; the default ad-hoc identity (-) keeps local builds
 * launchable.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function codesign(args) {
  execFileSync('codesign', args, { stdio: 'pipe' });
}

function signPath(p, identity) {
  try {
    codesign(['--force', '--sign', identity, '--timestamp=none', p]);
    return true;
  } catch (e) {
    console.warn(`[after-pack] sign failed for ${p}: ${String(e.stderr || e.message).split('\n')[0]}`);
    return false;
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const contents = path.join(appPath, 'Contents');
  const identity = process.env.APPLE_SIGNING_IDENTITY || '-';

  console.log(`[after-pack] signing ${appPath} (identity: ${identity})`);

  // 1. nested helper apps
  const frameworks = path.join(contents, 'Frameworks');
  if (fs.existsSync(frameworks)) {
    for (const entry of fs.readdirSync(frameworks)) {
      const p = path.join(frameworks, entry);
      if (entry.endsWith('.app')) {
        // sign a helper app: its own binary + nested frameworks first
        const helperContents = path.join(p, 'Contents');
        const helperFrameworks = path.join(helperContents, 'Frameworks');
        if (fs.existsSync(helperFrameworks)) {
          for (const f of fs.readdirSync(helperFrameworks)) {
            if (f.endsWith('.framework')) signPath(path.join(helperFrameworks, f), identity);
          }
        }
        const helperMacOS = path.join(helperContents, 'MacOS');
        if (fs.existsSync(helperMacOS)) {
          for (const f of fs.readdirSync(helperMacOS)) signPath(path.join(helperMacOS, f), identity);
        }
        signPath(p, identity);
      } else if (entry.endsWith('.framework')) {
        // sign the framework binary and any nested helpers
        const versions = path.join(frameworks, entry, 'Versions');
        if (fs.existsSync(versions)) {
          for (const v of fs.readdirSync(versions)) {
            const vdir = path.join(versions, v);
            if (!fs.statSync(vdir).isDirectory()) continue;
            const helpers = path.join(vdir, 'Helpers');
            if (fs.existsSync(helpers)) {
              for (const h of fs.readdirSync(helpers)) {
                const hp = path.join(helpers, h);
                if (fs.statSync(hp).isDirectory() && h.endsWith('.app')) {
                  const hmac = path.join(hp, 'Contents', 'MacOS');
                  if (fs.existsSync(hmac)) {
                    for (const f of fs.readdirSync(hmac)) signPath(path.join(hmac, f), identity);
                  }
                  signPath(hp, identity);
                } else {
                  signPath(hp, identity);
                }
              }
            }
            const libDir = path.join(vdir, 'Libraries');
            if (fs.existsSync(libDir)) {
              for (const l of fs.readdirSync(libDir)) {
                const lp = path.join(libDir, l);
                if (fs.statSync(lp).isFile()) signPath(lp, identity);
              }
            }
            const bin = path.join(vdir, entry.replace(/\.framework$/, ''));
            if (fs.existsSync(bin)) signPath(bin, identity);
          }
        }
      }
    }
  }

  // 2. the app's own executable
  const macosDir = path.join(contents, 'MacOS');
  if (fs.existsSync(macosDir)) {
    for (const f of fs.readdirSync(macosDir)) {
      signPath(path.join(macosDir, f), identity);
    }
  }

  // 3. the outer bundle
  signPath(appPath, identity);

  // verify (deep verification is fine; the problem was deep *signing*)
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
    console.log('[after-pack] signature verified OK');
  } catch (e) {
    console.warn('[after-pack] verify failed:', String(e.stderr || e.message).split('\n')[0]);
  }
};
