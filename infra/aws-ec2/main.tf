provider "aws" {
  region = var.aws_region
}

# Latest official Ubuntu 22.04 LTS AMI (Canonical's account), so we never
# have to hardcode a region-specific AMI ID.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Generated locally so `terraform apply` is fully self-contained — no
# manual "upload your public key to AWS" step required.
resource "tls_private_key" "this" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = "${var.project_name}-key"
  public_key = tls_private_key.this.public_key_openssh
}

# Private key saved next to this config, permissioned for SSH use.
# NOT committed to git (see .gitignore in this directory).
resource "local_sensitive_file" "private_key" {
  content         = tls_private_key.this.private_key_pem
  filename        = "${path.module}/${var.project_name}-key.pem"
  file_permission = "0400"
}

resource "aws_security_group" "this" {
  name        = "${var.project_name}-sg"
  description = "DenoiseAI backend: SSH (restricted), HTTP/HTTPS (public)"

  ingress {
    description = "SSH from your IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP (for Lets Encrypt + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    git_repo_url = var.git_repo_url
    git_branch   = var.git_branch
    frontend_url = var.frontend_url
  })

  root_block_device {
    volume_size = 8 # GB — well within the Free Tier's 30GB EBS allowance
    volume_type = "gp3"
  }

  tags = {
    Name = "${var.project_name}-backend"
  }
}

# Stable public IP — free as long as it stays attached to a running
# instance. If you ever stop the instance without releasing this, AWS
# starts billing for the unattached address.
resource "aws_eip" "this" {
  instance = aws_instance.backend.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}
