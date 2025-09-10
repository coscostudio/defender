import * as esbuild from 'esbuild';
import { readdirSync } from 'fs';
import { join, sep } from 'path';

// Config output
const BUILD_DIRECTORY = 'dist';
const PRODUCTION = process.env.NODE_ENV === 'production';

// Config entrypoint files
const ENTRY_POINTS = ['src/index.ts'];

// Config dev serving
const LIVE_RELOAD = !PRODUCTION;
// Allow overriding port/host via env when 3000 is busy
const SERVE_HOST = process.env.HOST || 'localhost';
const SERVE_PORT = Number(process.env.PORT || process.env.SERVE_PORT || 3000);
const SERVE_ORIGIN = `http://${SERVE_HOST}:${SERVE_PORT}`;

// Create context
const context = await esbuild.context({
  bundle: true,
  entryPoints: ENTRY_POINTS,
  outdir: BUILD_DIRECTORY,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  target: PRODUCTION ? 'es2020' : 'esnext',
  inject: LIVE_RELOAD ? ['./bin/live-reload.js'] : undefined,
  define: {
    SERVE_ORIGIN: JSON.stringify(SERVE_ORIGIN),
  },
});

// Build files in prod
if (PRODUCTION) {
  await context.rebuild();
  context.dispose();
}

// Watch and serve files in dev
else {
  await context.watch();
  try {
    const server = await context.serve({
      servedir: BUILD_DIRECTORY,
      port: SERVE_PORT,
      host: '0.0.0.0',
    });
    logServedFiles(server);
  } catch (err) {
    if (String(err).includes('address already in use')) {
      // eslint-disable-next-line no-console
      console.error(`\n[dev] Port ${SERVE_PORT} is in use. Try: PORT=3001 pnpm dev\n`);
    }
    throw err;
  }
}

/**
 * Logs information about the files that are being served during local development.
 */
function logServedFiles(server) {
  /**
   * Recursively gets all files in a directory.
   * @param {string} dirPath
   * @returns {string[]} An array of file paths.
   */
  const getFiles = (dirPath) => {
    const files = readdirSync(dirPath, { withFileTypes: true }).map((dirent) => {
      const path = join(dirPath, dirent.name);
      return dirent.isDirectory() ? getFiles(path) : path;
    });

    return files.flat();
  };

  const files = getFiles(BUILD_DIRECTORY);

  const filesInfo = files
    .map((file) => {
      if (file.endsWith('.map')) return;

      // Normalize path and create file location
      const paths = file.split(sep);
      const origin = `http://${SERVE_HOST}:${server.port}`;
      paths[0] = origin;

      const location = paths.join('/');

      // Create import suggestion
      const tag = location.endsWith('.css')
        ? `<link href="${location}" rel="stylesheet" type="text/css"/>`
        : `<script defer src="${location}"></script>`;

      return {
        'File Location': location,
        'Import Suggestion': tag,
      };
    })
    .filter(Boolean);

  // eslint-disable-next-line no-console
  console.table(filesInfo);
}
