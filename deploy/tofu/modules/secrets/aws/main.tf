locals {
  prefix = trim(var.name, "/")
}

resource "aws_secretsmanager_secret" "this" {
  for_each                = toset(var.secret_names)
  name                    = "${local.prefix}/${each.key}"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each      = toset(var.secret_value_names)
  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = var.secret_values[each.key]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.workload_identity["oidc_provider_arn"]]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.workload_identity["oidc_issuer"]}:sub"
      values   = ["system:serviceaccount:${var.reader.namespace}:${var.reader.name}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.workload_identity["oidc_issuer"]}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "read" {
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [for s in aws_secretsmanager_secret.this : s.arn]
  }
}

resource "aws_iam_role" "reader" {
  name               = "${replace(local.prefix, "/", "-")}-secrets-reader"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "reader" {
  name   = "read-secrets"
  role   = aws_iam_role.reader.id
  policy = data.aws_iam_policy_document.read.json
}
