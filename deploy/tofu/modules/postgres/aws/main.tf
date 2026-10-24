locals {
  instance_class = { small = "db.t4g.medium", medium = "db.m7g.xlarge", large = "db.m7g.2xlarge" }[var.size]
}

resource "random_password" "this" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.database_subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name        = "${var.name}-postgres"
  description = "PostgreSQL from the cluster private subnets only"
  vpc_id      = var.network_id
  tags        = var.tags
}

resource "aws_vpc_security_group_ingress_rule" "pg" {
  for_each          = toset(var.allowed_cidrs)
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = each.value
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_db_instance" "this" {
  identifier              = var.name
  engine                  = "postgres"
  engine_version          = var.postgres_version
  instance_class          = local.instance_class
  allocated_storage       = var.storage_gb
  max_allocated_storage   = var.storage_gb * 4
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = var.database_name
  username                = var.username
  password                = random_password.this.result
  db_subnet_group_name    = aws_db_subnet_group.this.name
  vpc_security_group_ids  = [aws_security_group.this.id]
  publicly_accessible     = false
  multi_az                = var.high_availability
  backup_retention_period = var.backup_retention_days
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = !var.deletion_protection
  copy_tags_to_snapshot   = true
  ca_cert_identifier      = "rds-ca-rsa2048-g1"
  tags                    = var.tags

  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
}
