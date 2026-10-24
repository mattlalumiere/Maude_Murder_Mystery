# Copy to terraform.tfvars and edit. Never commit real account ids or secrets.
region        = "us-east-1"
name          = "maude-use1"
bucket_suffix = "123456789012"
domain_name   = "maude.example.com"
ai_base_url   = "https://ai.internal.example.com/v1"
ai_model      = "REPLACE_MODEL"
alert_email   = "ops@example.com"

# Add a cell by adding a key. Each cell gets its own database, bucket and namespace.
cells = {
  "aws-use1-0" = { image_tag = "0.1.0", hostname = "use1-0.maude.example.com" }
  # "aws-use1-1" = { image_tag = "0.1.0", hostname = "use1-1.maude.example.com" }
}
