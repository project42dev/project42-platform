# Universal Hosting & Deployment Guide

Project 42 Platform is host-agnostic. The static site generator outputs pure HTML, JavaScript, and CSS that runs on any static hosting platform.

---

## Supported Hosting Platforms

### 1. Cloudflare Pages
- **Build Command**: `npm run build`
- **Build Output Directory**: `out` or `dist`
- **Environment Variables**: `NODE_VERSION = 22`

### 2. Azure Static Web Apps
- **App Location**: `/`
- **Output Location**: `dist`
- **API Location**: (optional)

### 3. GitHub Pages / GitLab Pages
- Automatically configured via GitHub Actions (`.github/workflows/deploy-pages.yml`).

### 4. AWS S3 + CloudFront
```bash
npm run build
aws s3 sync dist/ s3://your-project42-bucket --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### 5. Air-Gapped NGINX Container
```dockerfile
FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```
