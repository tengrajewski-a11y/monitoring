import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Whisper API przyjmuje pliki do 25MB — zostawiamy zapas na narzut multipart/form-data.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
