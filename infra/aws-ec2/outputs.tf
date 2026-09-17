output "elastic_ip" {
  description = "Stable public IP of the backend instance."
  value       = aws_eip.this.public_ip
}

output "ssh_command" {
  description = "Command to SSH into the instance."
  value       = "ssh -i ${local_sensitive_file.private_key.filename} ubuntu@${aws_eip.this.public_ip}"
}

output "health_check_url" {
  description = "Should return {\"status\":\"ok\",...} once boot finishes (allow 3-5 minutes for the user-data script to install TensorFlow etc.)."
  value       = "http://${aws_eip.this.public_ip}/health"
}
