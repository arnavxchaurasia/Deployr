terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# Networking — default VPC + subnets
# ---------------------------------------------------------------------------

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ---------------------------------------------------------------------------
# Security group for on-demand Fargate build tasks
# No inbound needed — tasks are short-lived and exit on their own.
# ---------------------------------------------------------------------------

resource "aws_security_group" "builder" {
  name        = "deployr-builder-sg"
  description = "Outbound-only SG for Deployr Fargate build tasks"
  vpc_id      = data.aws_vpc.default.id

  # HTTPS — git clone, npm registry, AWS APIs
  egress {
    description = "HTTPS outbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Aiven Kafka broker
  egress {
    description = "Aiven Kafka broker"
    from_port   = 20310
    to_port     = 20310
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "deployr-builder-sg"
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# ECR — build server image
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "builder" {
  name                 = "deployr-builder"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "deployr-builder"
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# ECS cluster
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "deployr-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "deployr-cluster"
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# CloudWatch log group for builder containers
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/deployr/builder"
  retention_in_days = 14

  tags = {
    Name        = "deployr-builder-logs"
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# ECS task definition
# Tasks are launched on-demand via RunTask; no Fargate service is created.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "builder" {
  family                   = "deployr-builder"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048

  task_role_arn      = aws_iam_role.ecs_task_role.arn
  execution_role_arn = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "builder-image"
      image     = "${aws_ecr_repository.builder.repository_url}:${var.ecr_image_tag}"
      essential = true

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.builder.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "builder"
        }
      }
    }
  ])

  tags = {
    Name        = "deployr-builder"
    Environment = var.environment
  }
}
