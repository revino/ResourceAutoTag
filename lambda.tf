#####################
# Lambda
#####################

data "archive_file" "notifier_package" {
  type        = "zip"
  source_dir = "${path.module}/function"
  output_path = "${path.module}/function/notifier.zip"
}

resource "aws_lambda_function" "resource_auto_tag" {
  function_name = "ResourceAutoTagFunction"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_execution_role.arn
  runtime       = "nodejs18.x"
  filename      = "${path.module}/function/notifier.zip"
  source_code_hash = data.archive_file.notifier_package.output_base64sha256
  timeout     = 300
  memory_size = 1024

  environment {
    variables = {
      bucketName = aws_s3_bucket.resource_auto_tag_bucket.bucket
    }
  }

  depends_on = [
    data.archive_file.notifier_package,
  ]
}

#####################
# Lambda IAM
#####################

resource "aws_iam_role" "lambda_execution_role" {
  name = "ResourceAutoTagSchedulerLambdaRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

# Policy 붙이기
resource "aws_iam_role_policy" "lambda_policy" {
  role   = aws_iam_role.lambda_execution_role.id
  policy = data.aws_iam_policy_document.lambda_policy_doc.json
}

# Notification Labmda에서 필요한 Policy
data "aws_iam_policy_document" "lambda_policy_doc" {

  #
  statement {
    sid = "ResourceAutoTaggerObserveAnnotate"

    actions = [
      "cloudwatch:PutMetricData",
      "ec2:DescribeInstances",
      "ec2:DescribeVolumes"
    ]
    resources = [
      "*"
    ]
  }

  #
  statement {
    sid = "ResourceAutoTaggerCreateUpdate"

    actions = [
      "logs:CreateLogStream",
      "ec2:CreateTags",
      "logs:CreateLogGroup",
      "logs:PutLogEvents"
    ]
    resources = [
      "arn:aws:ec2:*:${local.accountId}:instance/*",
      "arn:aws:ec2:*:${local.accountId}:volume/*",
      "arn:aws:logs:${local.region}:${local.accountId}:log-group:/aws/lambda/ResourceAutoTagCdkStack*:log-stream:*",
      "arn:aws:logs:${local.region}:${local.accountId}:log-group:/aws/lambda/ResourceAutoTagCdkStack*"
    ]
  }

  #
  statement {
    sid = "ResourceAutoTaggerRead"

    actions = [
      "iam:ListRoleTags",
      "iam:ListUserTags",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:GetLogEvents",
      "ssm:GetParametersByPath"
    ]
    resources = [
      "arn:aws:iam::${local.accountId}:role/*",
      "arn:aws:iam::${local.accountId}:user/*",
      "arn:aws:logs:${local.region}:${local.accountId}:log-group:/aws/lambda/ResourceAutoTagCdkStack*",
      "arn:aws:logs:${local.region}:${local.accountId}:log-group:/aws/lambda/ResourceAutoTagCdkStack*:log-stream:*",
      "arn:aws:ssm:*:${local.accountId}:parameter/*"
    ]
  }

  #
  statement {
    sid = "ResourceAutoTaggerReadMappingInS3"

    actions = [
      "s3:GetObject"
    ]
    resources = [
      "arn:aws:s3:::${aws_s3_bucket.resource_auto_tag_bucket.bucket}",
      "arn:aws:s3:::${aws_s3_bucket.resource_auto_tag_bucket.bucket}/*"
    ]
  }

  # Resource Explorer 읽기 권한
  statement {
    sid = "ResourceAutoTaggerResourceExplorer2"

    actions = [
      "resource-explorer-2:Search"
    ]
    resources = [
      "arn:aws:resource-explorer-2:${local.region}:${local.accountId}:view/*/*"
    ]
  }

  # Cloud Trail Event 읽기 권한
  statement {
    sid = "ResourceAutoTaggerCloudTrailEvents"

    actions = [
      "cloudtrail:LookupEvents"
    ]
    resources = [
      "*"
    ]
  }

  # S3 Tag Write 권한
  statement {
    sid = "ResourceAutoTaggerS3Tagging"

    actions = [
      "s3:PutBucketTagging",
      "s3:GetBucketTagging"
    ]
    resources = [
      "arn:aws:s3:::*"
    ]
  }

  # Tag 읽기 쓰기 권한
  statement {
    sid = "ResourceAutoTaggerResourceGroupTagging"

    actions = [
      "tag:TagResources",
      "tag:GetResources"
    ]
    resources = [
      "*"
    ]
  }

  #
  statement {
    sid = "ResourceAutoTaggerLambdaTagging"

    actions = [
      "lambda:TagResource"
    ]
    resources = [
      "arn:aws:lambda:${local.region}:${local.accountId}:function:*"
    ]
  }

  #
  statement {
    sid = "ResourceAutoTaggerECSTagging"

    actions = [
      "ecs:TagResource"
    ]
    resources = [
      "arn:aws:ecs:${local.region}:${local.accountId}:cluster/*"
    ]
  }
}



