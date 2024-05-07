#####################
# Setting
#####################

terraform {

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.48.0"
    }
  }

  required_version = ">= 1.5.0"
}

provider "aws" {
  region  = "ap-northeast-2"
}


locals {

  # Aws Information
  accountId = "ACCOUNT_ID"
  region = "REGION"
}