#!/bin/bash
# Runs once, as root, at first boot (cloud-init user-data).
# Installs the DenoiseAI backend, runs it under systemd, and puts nginx in
# front of it on plain HTTP. HTTPS is deliberately NOT set up here — the
# domain isn't known yet at boot time (it's a DuckDNS/Let's Encrypt step
# you do once the Elastic IP is available; see the module README).
set -euo pipefail

exec > /var/log/denoiseai-bootstrap.log 2>&1

apt-get update -y
apt-get install -y python3-venv python3-pip nginx git

APP_DIR=/home/ubuntu/app
sudo -u ubuntu git clone --branch "${git_branch}" "${git_repo_url}" "$APP_DIR"

cd "$APP_DIR/backend"
sudo -u ubuntu python3 -m venv .venv
sudo -u ubuntu .venv/bin/pip install --upgrade pip
sudo -u ubuntu .venv/bin/pip install -r requirements.txt

cat > /etc/systemd/system/denoiseai.service <<EOF
[Unit]
Description=DenoiseAI FastAPI backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP_DIR/backend
Environment="FRONTEND_URL=${frontend_url}"
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now denoiseai

cat > /etc/nginx/sites-available/denoiseai <<'NGINXEOF'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/denoiseai /etc/nginx/sites-enabled/denoiseai
nginx -t
systemctl restart nginx

# certbot is installed here so the later HTTPS step is just one command
# over SSH, with nothing left to `apt install`.
apt-get install -y certbot python3-certbot-nginx
