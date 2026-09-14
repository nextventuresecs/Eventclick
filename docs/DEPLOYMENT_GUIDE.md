# Deployment & DevOps Guide — Eventclick

Target Environment: **AWS EC2 (t3.small)** + **Cloudflare CDN/WAF** + **GitHub Actions CI/CD**.

---

## 1. SSM Parameter Store Requirements

All production configuration keys live in AWS SSM Parameter Store under path `/eventclick/prod/*` (Region: `ap-south-1`).

```bash
# Populate SSM secrets
aws ssm put-parameter --name "/eventclick/prod/JWT_SECRET" --value "<min-16-chars>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/JWT_REFRESH_SECRET" --value "<min-16-chars>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/DB_USER" --value "postgres" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/DB_PASSWORD" --value "<db-password>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/DB_NAME" --value "eventclick_prod" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/AUTH_DATABASE_URL" --value "postgresql://auth_svc_role:<auth-pw>@postgres:5432/eventclick_prod" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/APP_DATABASE_URL" --value "postgresql://app_user_login:<app-pw>@postgres:5432/eventclick_prod" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/REDIS_PASSWORD" --value "<redis-pw>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/REDIS_URL" --value "redis://:<redis-pw>@redis:6379" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/CORS_ORIGIN" --value "https://app.eventclick.live" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/APP_URL" --value "https://app.eventclick.live" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/COOKIE_DOMAIN" --value ".eventclick.live" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/LIVEKIT_URL" --value "wss://your-project.livekit.cloud" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/LIVEKIT_PUBLIC_URL" --value "https://your-project.livekit.cloud" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/LIVEKIT_API_KEY" --value "<key>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/LIVEKIT_API_SECRET" --value "<secret>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/RESEND_API_KEY" --value "<resend-key>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/RESEND_FROM_EMAIL" --value "noreply@eventclick.live" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/S3_ENDPOINT" --value "https://<account-id>.r2.cloudflarestorage.com" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/S3_PUBLIC_ENDPOINT" --value "https://pub-<hash>.r2.dev" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/S3_BUCKET" --value "eventclick-recordings" --type String --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/S3_ACCESS_KEY" --value "<r2-access-key>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/S3_SECRET_KEY" --value "<r2-secret-key>" --type SecureString --region ap-south-1
aws ssm put-parameter --name "/eventclick/prod/SQS_QUEUE_URL" --value "https://sqs.ap-south-1.amazonaws.com/123/eventclick-queue" --type String --region ap-south-1
```

---

## 2. Server Deployment Commands

Deployment is fully automated via `.github/workflows/deploy.yml` on push to `main`.

Manual trigger on EC2:
```bash
# SSH into EC2 or execute via AWS SSM
cd /home/deploy/app/Eventclick
./scripts/deploy.sh
```

---

## 3. Post-Deployment & Health Checks

Verify operational status:
```bash
# Check running containers
docker compose -f docker-compose.prod.yml ps

# Check deep health endpoint
docker exec Eventclick_server_prod wget -qO- http://localhost:4000/api/v1/health/deep

# Check Nginx access logs
docker compose -f docker-compose.prod.yml logs -f client
```

### After the first deploy to a new environment

The first container start creates the CloudWatch log group
`/eventclick/prod/containers` with retention set to never expire. Set it to 30
days by following [the log retention runbook](runbooks/log-retention.md). Read
its warning first: lowering retention permanently deletes older events.
