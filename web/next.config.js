/** The browser calls /api/*, which Next forwards to the API (no CORS needed). */
module.exports = {
  output: 'standalone',
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL || 'http://localhost:4000'}/:path*` }];
  },
};
