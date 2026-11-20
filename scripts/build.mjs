// Compila o TypeScript das páginas para dist/ (servido pelo Netlify junto com os HTML).
// Uso: npm run build | npm run dev (recompila a cada alteração)
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: { app: 'src/mega/main.ts', loteca: 'src/loteca/main.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: !watch,
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
