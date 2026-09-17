variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Short name used to tag/name all created resources."
  type        = string
  default     = "denoise-ai"
}

variable "instance_type" {
  description = "EC2 instance type. t2.micro/t3.micro are AWS Free Tier eligible (750 hrs/month for 12 months)."
  type        = string
  default     = "t3.micro"
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH into the instance, e.g. \"203.0.113.4/32\" (your public IP). Never leave this as 0.0.0.0/0."
  type        = string
}

variable "git_repo_url" {
  description = "HTTPS URL of the GitHub repo containing this project (must include the backend/ directory)."
  type        = string
}

variable "git_branch" {
  description = "Branch to deploy."
  type        = string
  default     = "main"
}

variable "frontend_url" {
  description = "Deployed Netlify frontend URL, used for the backend's CORS allow-list. Use \"*\" temporarily if not deployed yet."
  type        = string
  default     = "*"
}

variable "budget_alert_email" {
  description = "Email notified if AWS spend approaches/exceeds monthly_budget_usd. Set to \"\" to skip creating a budget alert."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly cost threshold (USD) for the budget alert."
  type        = string
  default     = "1"
}
