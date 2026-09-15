/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 是原生模块，不能被 Next 打包，交给 Node 运行时加载
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
