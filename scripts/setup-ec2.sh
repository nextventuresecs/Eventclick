#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EC2 Initial Setup Script — Ubuntu 24.04 LTS
# ─────────────────────────────────────────────────────────────────────────────
# Run as root on a fresh EC2 instance:
#   chmod +x setup-ec2.sh && sudo ./setup-ec2.sh
#
# What this does:
#   1. System updates + security patches
#   2. Creates a non-root deploy user
#   3. Installs Docker + Docker Compose
#   4. Configures firewall (UFW)
#   5. Sets up swap (critical for t3.small 2 GB)
#   6. Installs fail2ban (SSH brute-force protection)
#   7. Enables unattended security updates
#   8. Configures log rotation
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ── Must be root ────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (sudo)"
  exit 1
fi

DEPLOY_USER="${1:-deploy}"

# ═══════════════════════════════════════════════════════════════════════════
# 1. System Updates
# ═══════════════════════════════════════════════════════════════════════════
log "Updating system packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y \
  curl \
  wget \
  git \
  unzip \
  htop \
  jq \
  ufw \
  fail2ban \
  unattended-upgrades \
  apt-listchanges \
  ca-certificates \
  gnupg \
  lsb-release

# ═══════════════════════════════════════════════════════════════════════════
# 2. Create deploy user
# ═══════════════════════════════════════════════════════════════════════════
log "Creating deploy user: ${DEPLOY_USER}..."
if ! id "${DEPLOY_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  usermod -aG sudo "${DEPLOY_USER}"

  # Allow passwordless sudo for deploy tasks
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, /usr/bin/systemctl" \
    > "/etc/sudoers.d/${DEPLOY_USER}"
  chmod 440 "/etc/sudoers.d/${DEPLOY_USER}"

  # Copy SSH keys from root/ubuntu to deploy user
  if [[ -d /home/ubuntu/.ssh ]]; then
    mkdir -p "/home/${DEPLOY_USER}/.ssh"
    cp /home/ubuntu/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/" 2>/dev/null || true
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
    chmod 700 "/home/${DEPLOY_USER}/.ssh"
    chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys" 2>/dev/null || true
  fi
  log "Deploy user '${DEPLOY_USER}' created ✅"
else
  warn "User '${DEPLOY_USER}' already exists, skipping"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Install Docker
# ═══════════════════════════════════════════════════════════════════════════
log "Installing Docker Engine..."
if ! command -v docker &>/dev/null; then
  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Add the Docker repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Add deploy user to docker group
  usermod -aG docker "${DEPLOY_USER}"

  systemctl enable docker
  systemctl start docker
  log "Docker installed ✅"
else
  warn "Docker already installed, skipping"
fi

# CloudWatch log retention is not set here: the awslogs driver creates
# /eventclick/prod/containers on the first container start, with retention
# "never expire". After the first deploy, set 30 days with admin credentials
# (not this instance's role): see docs/runbooks/log-retention.md.

# ═══════════════════════════════════════════════════════════════════════════
# 4. Configure Firewall (UFW)
# ═══════════════════════════════════════════════════════════════════════════
log "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
# NOTE: ufw does not filter ports published by Docker. Docker writes its own
# iptables rules ahead of ufw's, so the client container's 80/443 are reachable
# whatever these two lines say. The AWS security group is the real control and
# must allow 80/443 from Cloudflare's ranges only. See
# docs/runbooks/origin-lockdown.md.
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'

# Enable UFW without interactive prompt
echo "y" | ufw enable
ufw status verbose
log "Firewall configured ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 5. Setup Swap (Critical for 2 GB instances)
# ═══════════════════════════════════════════════════════════════════════════
log "Setting up 2 GB swap file..."
SWAP_FILE="/swapfile"
if [[ ! -f "${SWAP_FILE}" ]]; then
  fallocate -l 2G "${SWAP_FILE}"
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
  swapon "${SWAP_FILE}"

  # Persist across reboots
  echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab

  # Optimize swappiness (low = prefer RAM, only swap under pressure)
  sysctl vm.swappiness=10
  echo "vm.swappiness=10" >> /etc/sysctl.conf

  # Cache pressure (reduce to keep directory info in memory)
  sysctl vm.vfs_cache_pressure=50
  echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf

  log "Swap configured ✅ (2 GB)"
else
  warn "Swap file already exists, skipping"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 6. Configure fail2ban (SSH protection)
# ═══════════════════════════════════════════════════════════════════════════
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban
log "fail2ban configured ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 7. Enable Unattended Security Updates
# ═══════════════════════════════════════════════════════════════════════════
log "Enabling unattended security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

systemctl enable unattended-upgrades
log "Unattended upgrades enabled ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 8. Configure Log Rotation for Docker
# ═══════════════════════════════════════════════════════════════════════════
log "Configuring Docker log rotation..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

systemctl restart docker
log "Docker log rotation configured ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 9. Create app directory
# ═══════════════════════════════════════════════════════════════════════════
APP_DIR="/home/${DEPLOY_USER}/app"
log "Creating app directory at ${APP_DIR}..."
mkdir -p "${APP_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

# Create backup directory
mkdir -p "/home/${DEPLOY_USER}/backups"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/backups"

# ═══════════════════════════════════════════════════════════════════════════
# 10. SSH Hardening
# ═══════════════════════════════════════════════════════════════════════════
log "Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd
log "SSH hardened ✅"

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN} EC2 Setup Complete! ✅${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  Deploy user:     ${DEPLOY_USER}"
echo "  App directory:   ${APP_DIR}"
echo "  Backup dir:      /home/${DEPLOY_USER}/backups"
echo "  Docker:          $(docker --version 2>/dev/null || echo 'installed')"
echo "  Swap:            $(swapon --show | tail -1 | awk '{print $3}' || echo '2G')"
echo "  Firewall:        Enabled (22, 80, 443)"
echo "  fail2ban:        Enabled (SSH)"
echo ""
echo "  Next steps:"
echo "    1. SSH in as '${DEPLOY_USER}':  ssh ${DEPLOY_USER}@<EC2_IP>"
echo "    2. Clone your repo:            cd ~/app && git clone <REPO_URL> ."
echo "    3. Copy .env.production.example → .env and fill in secrets"
echo "    4. Run deploy:                 ./scripts/deploy.sh"
echo ""
