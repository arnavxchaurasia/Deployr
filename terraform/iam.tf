# ---------------------------------------------------------------------------
# ECS task role — assumed by the running build container
# Grants S3, Lambda, ECR pull, and CloudWatch Logs access
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "deployr-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name        = "deployr-ecs-task-role"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "ecs_task_policy" {
  # S3 full access on the artifacts bucket
  statement {
    sid    = "S3ArtifactsBucket"
    effect = "Allow"
    actions = [
      "s3:*",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  # Lambda — create/update SSR functions and expose them via function URLs
  statement {
    sid    = "LambdaSSRFunctions"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:AddPermission",
      "lambda:CreateFunctionUrlConfig",
      "lambda:UpdateFunctionUrlConfig",
      "lambda:GetFunction",
      "lambda:GetFunctionUrlConfig",
    ]
    resources = ["arn:aws:lambda:*:*:function:deployr-*"]
  }

  # ECR — pull the builder image at task start (needed by execution role too)
  statement {
    sid    = "ECRPull"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPullFromRepo"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.builder.arn]
  }

  # CloudWatch Logs — write container logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.builder.arn}:*"]
  }

  # Allow passing the Lambda execution role to newly created functions
  statement {
    sid    = "PassLambdaExecutionRole"
    effect = "Allow"
    actions = [
      "iam:PassRole",
    ]
    resources = [aws_iam_role.lambda_execution_role.arn]
  }
}

resource "aws_iam_role_policy" "ecs_task_inline" {
  name   = "deployr-ecs-task-inline"
  role   = aws_iam_role.ecs_task_role.id
  policy = data.aws_iam_policy_document.ecs_task_policy.json
}

# ---------------------------------------------------------------------------
# Lambda execution role — assumed by SSR Lambda functions at runtime
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_execution_role" {
  name               = "deployr-lambda-execution-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "deployr-lambda-execution-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
