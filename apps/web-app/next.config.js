/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@comercios/shared-logic', '@comercios/ui-theme'],
  modularizeImports: {
    '@radix-ui/react-*': {
      transform: '@radix-ui/react-{{ member }}'
    }
  },
  // Necesario para el Dockerfile multi-stage (stage 2: runner).
  // Genera .next/standalone con un server.js mínimo sin node_modules completos.
  // Solo habilitar en producción: el build local sigue funcionando igual.
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  /**
   * Webpack: stub packages that are React Native / WatermelonDB-only.
   * These appear in shared-logic but are never used in the web bundle.
   * Setting alias to `false` makes webpack return an empty module ({})
   * instead of failing with "Module not found".
   */
  webpack: (config) => {
    const rnOnlyPackages = [
      'react-native',
      'react-i18next',
      '@react-native-async-storage/async-storage',
      '@nozbe/watermelondb',
      '@nozbe/watermelondb/decorators',
      '@nozbe/watermelondb/RawRecord',
      'expo-camera',
      'expo-constants',
      'html5-qrcode',
    ];
    for (const pkg of rnOnlyPackages) {
      config.resolve.alias[pkg] = false;
    }
    return config;
  },
};

module.exports = nextConfig;
