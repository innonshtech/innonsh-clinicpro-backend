/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
          }
        ],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: '/api/v1/admin/:path*',
      },
      {
        source: '/api/appointment/:path*',
        destination: '/api/v1/appointment/:path*',
      },
      {
        source: '/api/doctor/:path*',
        destination: '/api/v1/doctor/:path*',
      },
      {
        source: '/api/patients/:path*',
        destination: '/api/v1/patient/:path*',
      },
      {
        source: '/api/onelogin/:path*',
        destination: '/api/v1/auth/onelogin/:path*',
      },
      {
        source: '/api/receptionist-login/:path*',
        destination: '/api/v1/auth/receptionist-login/:path*',
      },
      {
        source: '/api/check-email/:path*',
        destination: '/api/v1/auth/check-email/:path*',
      },
      {
        source: '/api/reciptionist/:path*',
        destination: '/api/v1/receptionist/:path*',
      },
      {
        source: '/api/clinic/:path*',
        destination: '/api/v1/clinic/:path*',
      },
    ];
  },
};

export default nextConfig;


