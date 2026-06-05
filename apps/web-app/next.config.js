/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@comercios/shared-logic', '@comercios/ui-theme'],
  typescript: {
    strict: true
  },
  modularizeImports: {
    '@radix-ui/react-*': {
      transform: '@radix-ui/react-{{ member }}'
    }
  },
  // Necesario para el Dockerfile multi-stage (stage 2: runner).
  // Genera .next/standalone con un server.js mínimo sin node_modules completos.
  // Solo habilitar en producción: el build local sigue funcionando igual.
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
};

module.exports = nextConfig;
