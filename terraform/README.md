# Deployr AWS Infrastructure

## Prerequisites
- AWS CLI configured (`aws configure`)
- Terraform >= 1.5

## Usage
1. cd terraform/
2. terraform init
3. terraform plan -out=tfplan
4. terraform apply tfplan

## After Apply
Copy outputs into `api-server/.env`:
```
CLUSTER=<ecs_cluster_arn>
TASK=<ecs_task_definition_arn>
AWS_LAMBDA_ROLE_ARN=<lambda_execution_role_arn>
SECURITY_GROUP=<security_group_id>
SUBNETS=<subnet_ids>   # comma-separated; wrap in [] array format in awsService.js
```

## ECR Push
```bash
ECR_URL=$(terraform output -raw ecr_repository_url)

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$ECR_URL"

docker build -t deployr-builder ./server
docker tag deployr-builder:latest "$ECR_URL:latest"
docker push "$ECR_URL:latest"
```
