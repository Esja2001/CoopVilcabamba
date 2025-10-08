// vite.config.js - VERSIÓN ESTABLE SIN PROXY FACILITO + TERSER
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: true,
    proxy: {
      // 🔸 PROXY ESPECÍFICO: Para APIs con 'L' (DEBE IR PRIMERO)
      '/api-l/prctrans.php': {
        target: 'http://192.168.200.25/wsVirtualCoopSrvL/ws_server',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          const newPath = path.replace(/^\/api-l/, '');
          console.log('🔄 [PROXY-API-L] Rewrite específico:', path, '→', newPath);
          return newPath;
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('🔴 [PROXY ERROR - API-L]:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🚀 [PROXY REQ - API-L] ✅ PROXY ESPECÍFICO ACTIVADO:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📡 [PROXY RES - API-L] ✅ Respuesta del proxy específico:', proxyRes.statusCode, req.url);
          });
        }
      },
      
      // 🔹 PROXY GENÉRICO: Para otras APIs (SIN 'L')
      '/api': {
        target: 'http://192.168.200.25',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          const newPath = path.replace(/^\/api/, '/wsVirtualCoopSrv/ws_server');
          console.log('🔄 [PROXY-API] Rewrite genérico:', path, '→', newPath);
          return newPath;
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('🔴 [PROXY ERROR - API]:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🚀 [PROXY REQ - API] Proxy genérico (SIN L):', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📡 [PROXY RES - API] Respuesta genérica:', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'terser',
    // ✅ NUEVA CONFIGURACIÓN DE TERSER
    terserOptions: {
      compress: {
        drop_console: true,        // Elimina console.log, console.info, console.warn
        drop_debugger: true,       // Elimina debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug'] // Específicamente estos
      }
    }
  },
  
  plugins: [],
  
  resolve: {
    alias: {
      '@': '/src',
      '@services': '/services',
      '@assets': '/src/assets'
    }
  },
  
  define: {
    __API_URL__: JSON.stringify(process.env.API_URL || 'http://192.168.200.25/wsVirtualCoopSrv/ws_server/prctrans.php'),
    __API_TOKEN__: JSON.stringify(process.env.API_TOKEN || '0999SolSTIC20220719')
  },
  
  css: {
    devSourcemap: true
  }
})