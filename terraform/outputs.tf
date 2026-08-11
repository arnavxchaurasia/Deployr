output "ecs_cluster_arn" {
  description = "ARN of the Deployr ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_task_definition_arn" {
  description = "ARN of the builder ECS task definition (latest revision)"
  value       = aws_ecs_task_definition.builder.arn
}

output "ecr_repository_url" {
  description = "ECR repository URL for the builder image"
  value       = aws_ecr_repository.builder.repository_url
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role for SSR functions"
  value       = aws_iam_role.lambda_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role assumed by build containers"
  value       = aws_iam_role.ecs_task_role.arn
}

output "s3_bucket_name" {
  description = "Name of the S3 artifacts bucket"
  value       = aws_s3_bucket.artifacts.bucket
}

output "security_group_id" {
  description = "ID of the builder security group"
  value       = aws_security_group.builder.id
}

output "subnet_ids" {
  description = "Subnet IDs from the default VPC (pass as array to RunTask)"
  value       = data.aws_subnets.default.ids
}
