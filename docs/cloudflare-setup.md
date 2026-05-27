# Cloudflare Setup Guide — Eventclick

This guide covers setting up Cloudflare DNS, SSL, CDN, R2 storage, and security for the Eventclick production deployment.

## Prerequisites

- Cloudflare account (free plan): [dash.cloudflare.com](https://dash.cloudflare.com)
- Domain name purchased from any registrar
- EC2 instance running with an Elastic IP

---

## 1. Add Your Domain to Cloudflare

1. Log in to Cloudflare Dashboard
2. Click **"Add a Site"**
3. Enter your domain (e.g., `eventclick.com`)
4. Select **Free plan**
5. Cloudflare will scan existing DNS records
6. **Update your domain registrar's nameservers** to Cloudflare's:
   - Usually something like `ada.ns.cloudflare.com` and `beth.ns.cloudflare.com`
   - This propagation takes 10–60 minutes

---

## 2. DNS Records

Create the following DNS records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| `A` | `app` | `<EC2_ELASTIC_IP>` | ☁️ Proxied | Auto |
| `A` | `api` | `<EC2_ELASTIC_IP>` | ☁️ Proxied | Auto |
| `CNAME` | `www` | `app.eventclick.com` | ☁️ Proxied | Auto |
| `A` | `@` | `<EC2_ELASTIC_IP>` | ☁️ Proxied | Auto |

> **Note:** All records should be **Proxied** (orange cloud ☁️) to get Cloudflare's CDN, DDoS protection, and SSL.

### For LiveKit Cloud (no DNS needed)
Since we're using LiveKit Cloud, you don't need a `lk.` subdomain. The LiveKit Cloud URL (e.g., `wss://your-project.livekit.cloud`) is managed by LiveKit.

---

## 3. SSL/TLS Configuration

1. Go to **SSL/TLS** → **Overview**
2. Set encryption mode to **Full (Strict)**

### Generate Origin Certificate (for EC2's Nginx)

1. Go to **SSL/TLS** → **Origin Server**
2. Click **Create Certificate**
3. Settings:
   - Private key type: **RSA (2048)**
   - Hostnames: `*.eventclick.com, eventclick.com`
   - Certificate validity: **15 years** (free)
4. **Download** the certificate and private key
5. Save on EC2:

```bash
# On EC2 as root
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin-cert.pem    # Paste certificate
sudo nano /etc/ssl/cloudflare/origin-key.pem     # Paste private key
sudo chmod 600 /etc/ssl/cloudflare/origin-key.pem
```

> **Note:** For the MVP with the Nginx config we've set up, Cloudflare handles SSL termination at their edge. The origin certificate is an extra layer of security between Cloudflare and your EC2. If you want to skip this initially, you can use **Full** mode instead of **Full (Strict)**.

### Enable Always Use HTTPS

1. Go to **SSL/TLS** → **Edge Certificates**
2. Enable **Always Use HTTPS** ✅
3. Enable **Automatic HTTPS Rewrites** ✅
4. Set **Minimum TLS Version** to **TLS 1.2**

---

## 4. Cloudflare R2 Storage Setup

R2 is S3-compatible object storage with zero egress fees.

### Create a Bucket

1. Go to **R2 Object Storage** in the sidebar
2. Click **Create bucket**
3. Bucket name: `eventclick-recordings`
4. Location hint: Choose closest to your EC2 region (e.g., Eastern North America)
5. Default storage class: **Standard**

### Generate R2 API Token

1. Go to **R2** → **Manage R2 API Tokens**
2. Click **Create API Token**
3. Settings:
   - Token name: `eventclick-server`
   - Permissions: **Object Read & Write**
   - Specify bucket: `eventclick-recordings`
4. Click **Create API Token**
5. **Save these values** (shown only once):

```
Account ID:     → Use in S3_ENDPOINT: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
Access Key ID:  → Use as S3_ACCESS_KEY
Secret Access Key: → Use as S3_SECRET_KEY
```

### Enable Public Access (optional, for direct file links)

1. Go to your bucket → **Settings**
2. Under **Public Access**, click **Allow Access**
3. You'll get a URL like: `https://pub-XXXX.r2.dev`
4. Use this as `S3_PUBLIC_ENDPOINT` in your `.env`

### Update .env

```env
S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://pub-YOUR_HASH.r2.dev
S3_REGION=auto
S3_BUCKET=eventclick-recordings
S3_ACCESS_KEY=your_r2_access_key_id
S3_SECRET_KEY=your_r2_secret_access_key
S3_FORCE_PATH_STYLE=false
```

---

## 5. Security Settings

### Bot Fight Mode

1. Go to **Security** → **Bots**
2. Enable **Bot Fight Mode** ✅

### Firewall Rules (1 free rule)

1. Go to **Security** → **WAF** → **Custom rules**
2. Create a rule to block suspicious traffic:

**Example: Block non-browser traffic to API**
```
Rule name: Block suspicious API requests
Expression: (http.request.uri.path contains "/api/" and cf.client.bot)
Action: Block
```

### Rate Limiting

Cloudflare free plan doesn't include advanced rate limiting, but your Express server already has `express-rate-limit` configured.

### DDoS Protection

- **Automatic** on Cloudflare free plan ✅
- No configuration needed

---

## 6. Caching Configuration

### Page Rules (3 free rules)

Create these page rules in order:

**Rule 1: No cache for API**
- URL: `*api.eventclick.com/api/*`
- Setting: Cache Level → **Bypass**

**Rule 2: Cache static assets aggressively**
- URL: `*app.eventclick.com/*.js`
- Setting: Cache Level → **Cache Everything**, Edge Cache TTL → **1 month**

**Rule 3: Force HTTPS everywhere**
- URL: `*eventclick.com/*`
- Setting: **Always Use HTTPS**

### Cache Behavior

With Cloudflare proxying, your Nginx `Cache-Control` headers are respected:
- `public, immutable` on hashed assets → Cloudflare caches at edge
- `no-cache` on `index.html` → Always fetches from origin (instant deploys)

---

## 7. Verify Setup

After configuring everything, verify:

```bash
# Check DNS propagation
dig app.eventclick.com +short
dig api.eventclick.com +short

# Check SSL
curl -I https://app.eventclick.com
# Should show: HTTP/2 200, cf-ray header, strict-transport-security

# Check API through Cloudflare
curl https://api.eventclick.com/api/v1/health
# Should return: {"status":"ok","timestamp":"...","uptime":...}

# Verify R2 connectivity (from EC2)
aws s3 ls s3://eventclick-recordings/ \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --region auto
```

---

## 8. Monitoring with Cloudflare Analytics

Cloudflare free plan includes:
- **Traffic analytics**: Requests, bandwidth, threats blocked
- **DNS analytics**: Query volume
- **Web Analytics** (add JS snippet for real user monitoring)

Go to **Analytics & Logs** → **Traffic** for real-time dashboards.

---

## Troubleshooting

### "522 Connection Timed Out"
- EC2 security group doesn't allow port 80/443 from Cloudflare IPs
- Fix: Add inbound rule for `0.0.0.0/0` on port 80 (Cloudflare acts as proxy)

### "521 Web Server Is Down"
- Nginx/Docker not running on EC2
- Fix: `docker compose -f docker-compose.prod.yml ps` and restart

### "525 SSL Handshake Failed"
- Origin certificate not properly installed
- Fix: Switch SSL mode to **Full** (instead of Full Strict) as interim fix

### R2 "Access Denied"
- API token doesn't have the right bucket permissions
- Fix: Regenerate token with Object Read & Write on the specific bucket
