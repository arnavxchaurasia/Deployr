variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "ecr_image_tag" {
  description = "Docker image tag to use for the builder ECS task"
  type        = string
  default     = "latest"
}
