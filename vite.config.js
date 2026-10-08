import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `vite dev` doesn't run Vercel's /api functions. This serves api/*.js locally
// (same (req, res) handler signature) so `npm run dev` works without `vercel dev`.
// Needs VITE_PFMS_SUPABASE_URL / PFMS_SUPABASE_SERVICE_ROLE_KEY in .env (see api/material-testing.js).
function localApi(mode) {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/api\/([\w-]+)$/);
        if (!match) return next();
        try {
          // Re-read .env on every call so editing it never needs a dev-server restart.
          Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`);
          let raw = '';
          for await (const chunk of req) raw += chunk;
          req.query = Object.fromEntries(url.searchParams);
          req.body = raw ? JSON.parse(raw) : {};
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
          };
          await mod.default(req, res);
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), localApi(mode)],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'recharts',
        'date-fns'
      ]
    },
    server: {
      host: true,
      port: 3000
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true
    }
  };
});
