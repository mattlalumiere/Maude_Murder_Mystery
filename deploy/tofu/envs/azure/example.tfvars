# Copy to terraform.tfvars and edit. Never commit real ids or secrets.
subscription_id = "00000000-0000-0000-0000-000000000000"
location        = "westeurope"
name            = "maude-weu"
name_suffix     = "x7k2"
domain_name     = "maude.example.com"
ai_base_url     = "https://ai.internal.example.com/v1"
ai_model        = "REPLACE_MODEL"
alert_email     = "ops@example.com"

cells = {
  "az-weu-0" = { image_tag = "0.1.0", hostname = "weu-0.maude.example.com" }
  # "az-weu-1" = { image_tag = "0.1.0", hostname = "weu-1.maude.example.com" }
}
