// Where the AttendIQ API runs. The browser calls /api/v1/* on this site and
// Next.js forwards it here, so no CORS setup is needed.
const API_ORIGIN = (
  process.env.API_ORIGIN ??
  (process.env.VERCEL ? 'https://api-aadnan-hotmailcoms-projects.vercel.app' : 'http://localhost:4000')
).replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default nextConfig;
