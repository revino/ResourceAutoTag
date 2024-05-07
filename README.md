# AWS Resource 자동 태깅을 위한 Terraform Code

Terraform을 사용하여 리소스에 자동 태깅을 합니다. 

## 사용 리소스

1. Event Bridge, Lambda, S3, Cloud Trail, Resource Explorer를 사용합니다.

## 추가한 작업 내용

1. 3가지 Config File을 지원합니다.
   1. config.json : Slack과 CloudTrail과 Resource Explorer의 최대 검색 시간을 설정할 수 있습니다.
   2. mapping.json : 자동으로 태깅할 Resource의 종류를 설정합니다.
   3. tag.json : 해당 설정 파일의 태그를 자동으로 적용합니다.
4. Slack 전송기능을 추가하였습니다.
   1. Slack 전송 조건은 tag.json 에 정의된 Tag Key가 설정되지 않을 경우 설정된 Slack Channel에 알림이 갑니다.


## 참고 문서

- https://aws.amazon.com/ko/blogs/mt/tag-your-aws-resources-consistently-with-aws-resource-explorer-and-aws-cloudtrail/
