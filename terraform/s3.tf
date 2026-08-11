data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# S3 bucket — build artifacts, static output, and cache
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "artifacts" {
  bucket = "vercel-clone-ws"

  tags = {
    Name        = "vercel-clone-ws"
    Environment = var.environment
  }
}

# Versioning off — reduces storage cost for ephemeral build artifacts
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Disabled"
  }
}

# CORS — allows browsers to fetch static assets directly from S3
resource "aws_s3_bucket_cors_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  cors_rule {
    allowed_origins = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# Block public access — allow bucket policies but block legacy ACL grants
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false # allow the policy below to grant public read
  restrict_public_buckets = false
}

# Bucket policy — public GET on __outputs/* (deployed static site assets)
resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  # The public-access block must be applied before the policy can be attached
  depends_on = [aws_s3_bucket_public_access_block.artifacts]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadStaticOutputs"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.artifacts.arn}/__outputs/*"
      }
    ]
  })
}

# Lifecycle — expire build cache after 30 days to control storage costs
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-build-cache"
    status = "Enabled"

    filter {
      prefix = "__cache/"
    }

    expiration {
      days = 30
    }
  }
}
