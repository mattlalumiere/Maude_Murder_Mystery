# Copy to terraform.tfvars and edit. Never commit real ids or secrets.
project_id    = "my-project"
region        = "us-central1"
name          = "maude-usc1"
bucket_suffix = "x7k2"
domain_name   = "maude.example.com"
ai_base_url   = "https://ai.internal.example.com/v1"
ai_model      = "REPLACE_MODEL"
alert_email   = "ops@example.com"

cells = {
  "gcp-usc1-0" = { image_tag = "0.1.0", hostname = "usc1-0.maude.example.com" }
  # "gcp-usc1-1" = { image_tag = "0.1.0", hostname = "usc1-1.maude.example.com" }
}
