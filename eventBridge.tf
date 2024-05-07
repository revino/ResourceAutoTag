#####################
# Event Bridge
#####################

# 30분 간격으로 실행
resource "aws_cloudwatch_event_rule" "lambda_scheduler" {
  name                = "ResourceAutoTagScheduler"
  schedule_expression = "rate(30 minutes)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.lambda_scheduler.name
  target_id = "TargetFunction"
  arn       = aws_lambda_function.resource_auto_tag.arn
}

